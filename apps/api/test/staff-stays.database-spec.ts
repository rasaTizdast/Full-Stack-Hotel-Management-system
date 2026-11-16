import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { AuditService } from '../src/audit/audit.service';
import { addDays, parseDateOnly } from '../src/availability/date-range';
import type { BookingStatus, HousekeepingStatus } from '../src/generated/prisma/enums';
import { hotelBusinessDate } from '../src/rooms/room-capacity.service';
import { bookingRoute, RoomBoardFixture } from './room-board-fixture';

const walkInRoute = bookingRoute('walk-ins');
const reason = 'Guest did not arrive after contact attempts.';
const guest = {
  guestName: 'Private fixture guest',
  guestPhone: '+989121234567',
  guestEmail: 'private-guest@example.invalid',
  guestCount: 1,
  roomQuantity: 1,
};
type Property = Awaited<ReturnType<RoomBoardFixture['createProperty']>>;
type Staff = Awaited<ReturnType<RoomBoardFixture['staff']>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe('Front-desk mutations over HTTP and PostgreSQL', () => {
  let fixture: RoomBoardFixture;
  let property: Property;
  let receptionist: Staff;
  let manager: Staff;
  let housekeeper: Staff;
  let today: string;
  let yesterday: string;
  let tomorrow: string;
  let dayAfter: string;

  async function inventory(start: string, bookedRooms = 0, totalRooms = 3) {
    await fixture.prisma.roomNightInventory.createMany({
      data: [yesterday, today, tomorrow]
        .filter((date) => date >= start)
        .map((date, index) => ({
          roomTypeId: property.type.id,
          stayDate: parseDateOnly(date),
          totalRooms,
          bookedRooms,
          nightlyPriceToman: 100_000n + BigInt(index * 50_000),
        })),
    });
  }

  async function stay(
    checkIn = today,
    checkOut = dayAfter,
    roomQuantity = 1,
    status: BookingStatus = 'CONFIRMED',
  ) {
    const nights = [yesterday, today, tomorrow].filter(
      (date) => checkIn <= date && date < checkOut,
    );
    return fixture.prisma.booking.create({
      data: {
        ...guest,
        publicReference: randomUUID().slice(0, 16),
        status,
        roomTypeId: property.type.id,
        checkIn: parseDateOnly(checkIn),
        checkOut: parseDateOnly(checkOut),
        roomQuantity,
        totalPriceToman: 100_000n * BigInt(nights.length * roomQuantity),
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        nights: {
          create: nights.map((date) => ({
            stayDate: parseDateOnly(date),
            nightlyPriceToman: 100_000n,
            roomQuantity,
            amountToman: 100_000n * BigInt(roomQuantity),
          })),
        },
      },
    });
  }

  async function assign(bookingId: string, roomIndex = 0, start = today, end = dayAfter) {
    return fixture.prisma.roomAssignment.create({
      data: {
        bookingId,
        roomTypeId: property.type.id,
        roomId: property.rooms[roomIndex].id,
        startDate: parseDateOnly(start),
        endDate: parseDateOnly(end),
        assignedByStaffUserId: receptionist.id,
      },
    });
  }

  async function setCheckInTime(checkInTime: string) {
    await fixture.prisma.hotel.update({ where: { id: property.hotel.id }, data: { checkInTime } });
  }

  function walkIn(key?: string, checkIn = today, route = walkInRoute) {
    const request = fixture.client().post(route).set(receptionist.headers);
    if (key !== undefined) request.set('Idempotency-Key', key);
    return request.send({
      ...guest,
      checkIn,
      checkOut: dayAfter,
      roomTypeSlug: property.type.slug,
    });
  }

  function action(
    reference: string,
    name: string,
    body: Record<string, unknown> = {},
    headers: Record<string, string> = receptionist.headers,
  ) {
    return fixture
      .client()
      .post(bookingRoute(reference) + '/' + name)
      .set(headers)
      .send(body);
  }

  function counters() {
    return fixture.prisma.roomNightInventory.findMany({
      where: { roomTypeId: property.type.id },
      orderBy: { stayDate: 'asc' },
      select: { heldRooms: true, bookedRooms: true },
    });
  }

  function audits(targetId: string) {
    return fixture.prisma.auditEvent.findMany({ where: { targetType: 'BOOKING', targetId } });
  }

  function persisted(bookingId: string) {
    return fixture.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { nights: { orderBy: { stayDate: 'asc' } }, assignments: true },
    });
  }

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
    [receptionist, manager, housekeeper] = await Promise.all([
      fixture.staff('RECEPTIONIST'),
      fixture.staff('MANAGER'),
      fixture.staff('HOUSEKEEPER'),
    ]);
  });

  beforeEach(async () => {
    // Keep local time near noon so early tests stay away from midnight.
    const offset = new Date().getUTCHours() - 12;
    const timezone = offset === 0 ? 'UTC' : `Etc/GMT${offset > 0 ? '+' : ''}${offset}`;
    property = await fixture.createProperty(timezone);
    today = hotelBusinessDate(timezone).toISOString().slice(0, 10);
    yesterday = addDays(today, -1);
    tomorrow = addDays(today, 1);
    dayAfter = addDays(today, 2);
    await setCheckInTime('00:00');
  });

  // The shared fixture closes the app, deletes mutable fixtures and deactivates
  // staff whose original audit records must remain append-only.
  afterAll(async () => fixture?.close());

  it('books immutable night prices once on concurrent exact walk-in retries', async () => {
    await inventory(today);
    const key = randomUUID();
    const results = await Promise.all([walkIn(key).expect(201), walkIn(key).expect(201)]);
    expect(results[0].body as unknown).toEqual(results[1].body as unknown);
    expect(results[0].headers['cache-control']).toBe('private, no-store');
    expect(Object.keys(results[0].body as object).sort()).toEqual([
      'checkIn',
      'checkOut',
      'checkedInAt',
      'confirmedAt',
      'noShowAt',
      'reference',
      'status',
    ]);
    const booking = await fixture.prisma.booking.findUniqueOrThrow({
      where: { idempotencyKey: key },
    });
    expect(booking).toMatchObject({ status: 'CONFIRMED', totalPriceToman: 250_000n });
    expect(booking.confirmedAt).toBeInstanceOf(Date);
    expect((await persisted(booking.id)).nights.map((night) => night.nightlyPriceToman)).toEqual([
      100_000n,
      150_000n,
    ]);
    await fixture.prisma.roomNightInventory.updateMany({
      where: { roomTypeId: property.type.id },
      data: { nightlyPriceToman: 200_000n },
    });
    await walkIn(key).expect(201);
    expect((await persisted(booking.id)).nights.map((night) => night.nightlyPriceToman)).toEqual([
      100_000n,
      150_000n,
    ]);
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 1 },
      { heldRooms: 0, bookedRooms: 1 },
    ]);
    expect(await audits(booking.id)).toMatchObject([
      {
        eventName: 'BOOKING_WALK_IN',
        actorStaffUserId: receptionist.id,
        after: { status: 'CONFIRMED' },
      },
    ]);
  });

  it('rejects a missing key, non-business-date arrival and reuse across booking intents', async () => {
    const publicTimeZone = 'Asia/Tehran';
    today = hotelBusinessDate(publicTimeZone).toISOString().slice(0, 10);
    yesterday = addDays(today, -1);
    tomorrow = addDays(today, 1);
    dayAfter = addDays(today, 2);
    const easternTimeZone = 'Pacific/Kiritimati';
    const timezone =
      hotelBusinessDate(easternTimeZone).toISOString().slice(0, 10) === today
        ? 'Etc/GMT+12'
        : easternTimeZone;
    await fixture.prisma.hotel.update({ where: { id: property.hotel.id }, data: { timezone } });
    const propertyDate = hotelBusinessDate(timezone).toISOString().slice(0, 10);
    expect(propertyDate).not.toBe(today);
    const wrongDate = await walkIn(randomUUID()).expect(400);
    expect(wrongDate.body as unknown).toMatchObject({ code: 'WALK_IN_ARRIVAL_DATE_INVALID' });
    await fixture.prisma.hotel.update({
      where: { id: property.hotel.id },
      data: { timezone: publicTimeZone },
    });

    await inventory(today);
    await walkIn().expect(400);
    await walkIn(randomUUID(), tomorrow).expect(400);
    const key = randomUUID();
    await walkIn(key).expect(201);
    await walkIn(key, tomorrow).expect(409);
    await walkIn(key, today, '/api/v1/bookings').expect(409);

    // An exact retry survives a change of the property's current business date.
    await fixture.prisma.hotel.update({ where: { id: property.hotel.id }, data: { timezone } });
    await walkIn(key).expect(201);
  });

  it('allows only one of two walk-ins racing for the last unit', async () => {
    await inventory(today, 0, 1);
    const results = await Promise.all([walkIn(randomUUID()), walkIn(randomUUID())]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 1 },
      { heldRooms: 0, bookedRooms: 1 },
    ]);
  });

  it('rolls back walk-in inventory, booking and prices if its audit fails', async () => {
    await inventory(today);
    const key = randomUUID();
    const record = jest
      .spyOn(AuditService.prototype, 'record')
      .mockRejectedValueOnce(new Error('Fixture audit failure'));
    try {
      await walkIn(key).expect(500);
    } finally {
      record.mockRestore();
    }
    expect(await fixture.prisma.booking.findUnique({ where: { idempotencyKey: key } })).toBeNull();
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 0 },
      { heldRooms: 0, bookedRooms: 0 },
    ]);
  });

  it('requires distinct coverage for every remaining night and never changes counters at check-in', async () => {
    await inventory(today, 2);
    const booking = await stay(today, dayAfter, 2);
    await assign(booking.id);
    await assign(booking.id, 0, today, tomorrow);
    const reference = booking.publicReference;
    await action(reference, 'check-in').expect(409);
    await fixture.prisma.roomAssignment.deleteMany({
      where: { bookingId: booking.id, endDate: parseDateOnly(tomorrow) },
    });
    await fixture.prisma.room.update({
      where: { id: property.rooms[1].id },
      data: { housekeepingStatus: 'INSPECTED' },
    });
    const partial = await assign(booking.id, 1, today, tomorrow);
    await action(reference, 'check-in').expect(409);
    await fixture.prisma.roomAssignment.update({
      where: { id: partial.id },
      data: { endDate: parseDateOnly(dayAfter) },
    });
    const first = await action(reference, 'check-in').expect(200);
    const retry = await action(reference, 'check-in').expect(200);
    expect(first.body as unknown).toEqual(retry.body as unknown);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(Object.keys(first.body as object).sort()).toEqual([
      'checkIn',
      'checkOut',
      'checkedInAt',
      'confirmedAt',
      'noShowAt',
      'reference',
      'status',
    ]);
    const updated = await persisted(booking.id);
    expect(updated).toMatchObject({
      status: 'CHECKED_IN',
      checkedInByStaffUserId: receptionist.id,
    });
    expect(updated.checkedInAt).toBeInstanceOf(Date);
    expect(await audits(booking.id)).toMatchObject([
      { eventName: 'BOOKING_CHECK_IN', actorStaffUserId: receptionist.id, reason: null },
    ]);
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 2 },
      { heldRooms: 0, bookedRooms: 2 },
    ]);
  });

  it.each(['DIRTY', 'CLEAN'] as HousekeepingStatus[])(
    'rejects check-in when an assigned room is %s',
    async (housekeepingStatus) => {
      const booking = await stay();
      await assign(booking.id);
      await fixture.prisma.room.update({
        where: { id: property.rooms[0].id },
        data: { housekeepingStatus },
      });
      await action(booking.publicReference, 'check-in').expect(409);
      expect((await persisted(booking.id)).status).toBe('CONFIRMED');
    },
  );

  it('rejects an inactive room, a future block, and a conflicting assignment', async () => {
    const booking = await stay();
    await assign(booking.id);
    await fixture.prisma.room.update({
      where: { id: property.rooms[0].id },
      data: { isActive: false },
    });
    await action(booking.publicReference, 'check-in').expect(409);
    await fixture.prisma.room.update({
      where: { id: property.rooms[0].id },
      data: { isActive: true },
    });
    const block = await fixture.prisma.roomBlock.create({
      data: {
        roomId: property.rooms[0].id,
        startDate: parseDateOnly(tomorrow),
        endDate: parseDateOnly(dayAfter),
        reason: 'Fixture block',
        createdByStaffUserId: receptionist.id,
      },
    });
    await action(booking.publicReference, 'check-in').expect(409);
    await fixture.prisma.roomBlock.update({ where: { id: block.id }, data: { isActive: false } });
    const conflictingBooking = await stay();
    await assign(conflictingBooking.id, 0, tomorrow);
    await action(booking.publicReference, 'check-in').expect(409);
    expect(await audits(booking.id)).toEqual([]);
  });

  it('requires a manager and reason before arrival time and still checks readiness', async () => {
    await setCheckInTime('23:59');
    const booking = await stay();
    await assign(booking.id, 1);
    const reference = booking.publicReference;
    const override = { earlyCheckInReason: '  Room is ready for a guest requiring assistance.  ' };
    await action(reference, 'check-in', override).expect(403);
    await action(reference, 'check-in', { earlyCheckInReason: '  ' }, manager.headers).expect(400);
    await action(reference, 'check-in', override, manager.headers).expect(409);
    await fixture.prisma.room.update({
      where: { id: property.rooms[1].id },
      data: { housekeepingStatus: 'INSPECTED' },
    });
    await action(reference, 'check-in', override, manager.headers).expect(200);
    expect(await audits(booking.id)).toMatchObject([
      { actorStaffUserId: manager.id, reason: override.earlyCheckInReason.trim() },
    ]);
  });

  it('checks in a late arrival before the configured time if remaining nights are covered', async () => {
    await setCheckInTime('23:59');
    const booking = await stay(yesterday);
    await assign(booking.id);
    await action(booking.publicReference, 'check-in').expect(200);
    expect((await persisted(booking.id)).status).toBe('CHECKED_IN');
  });

  it('rechecks readiness after waiting for the assigned room lock', async () => {
    const booking = await stay();
    await assign(booking.id);
    const locked = deferred<number>();
    const release = deferred<void>();
    const changeReadiness = fixture.prisma.$transaction(async (transaction) => {
      await transaction.room.update({
        where: { id: property.rooms[0].id },
        data: { housekeepingStatus: 'DIRTY' },
      });
      const [{ pid }] = await transaction.$queryRaw<
        Array<{ pid: number }>
      >`SELECT pg_backend_pid() AS pid`;
      locked.resolve(pid);
      await release.promise;
    });
    const blockingPid = await Promise.race([
      locked.promise,
      changeReadiness.then(() => {
        throw new Error('Room transaction exited before acquiring its lock.');
      }),
    ]);
    const response = action(booking.publicReference, 'check-in').then((result) => result);
    let waiting = false;
    try {
      const deadline = Date.now() + 2_000;
      while (!waiting && Date.now() < deadline) {
        const [result] = await fixture.prisma.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE ${blockingPid}::integer = ANY(pg_blocking_pids(pid))
          ) AS waiting
        `;
        waiting = result.waiting;
        if (!waiting) await setTimeout(20);
      }
    } finally {
      release.resolve(undefined);
      await changeReadiness;
    }
    const result = await response;
    expect(waiting).toBe(true);
    expect(result.status).toBe(409);
    expect(result.body as unknown).toMatchObject({ code: 'ROOM_NOT_INSPECTED' });
    expect((await persisted(booking.id)).status).toBe('CONFIRMED');
  });

  it('rejects check-in and no-show outside the due-in date window or confirmed status', async () => {
    for (const booking of [
      await stay(tomorrow),
      await stay(yesterday, today),
      await stay(today, dayAfter, 1, 'PENDING_CONFIRMATION'),
    ]) {
      await action(
        booking.publicReference,
        'check-in',
        { earlyCheckInReason: reason },
        manager.headers,
      ).expect(409);
      await action(booking.publicReference, 'no-show', { reason }).expect(409);
    }
  });

  it('waits until configured local check-in time for a same-day no-show and requires a reason', async () => {
    await setCheckInTime('23:59');
    await inventory(today, 1);
    const booking = await stay();
    await action(booking.publicReference, 'no-show', { reason }).expect(409);
    await setCheckInTime('00:00');
    const missing = await action(booking.publicReference, 'no-show').expect(400);
    const blank = await action(booking.publicReference, 'no-show', { reason: '  ' }).expect(400);
    expect(missing.body as unknown).toMatchObject({ code: 'NO_SHOW_REASON_REQUIRED' });
    expect(blank.body as unknown).toMatchObject({ code: 'NO_SHOW_REASON_REQUIRED' });
    await action(booking.publicReference, 'no-show', { reason }).expect(200);
  });

  it('releases only current and future inventory once, preserving snapshots and reason on retry', async () => {
    await setCheckInTime('23:59');
    await inventory(yesterday, 1);
    const booking = await stay(yesterday);
    await assign(booking.id, 0, yesterday);
    const original = await persisted(booking.id);
    const reference = booking.publicReference;
    const replies = await Promise.all([
      action(reference, 'no-show', { reason }).expect(200),
      action(reference, 'no-show', { reason }).expect(200),
    ]);
    expect(replies[0].body as unknown).toEqual(replies[1].body as unknown);
    expect(Object.keys(replies[0].body as object).sort()).toEqual([
      'checkIn',
      'checkOut',
      'checkedInAt',
      'confirmedAt',
      'noShowAt',
      'reference',
      'status',
    ]);
    await action(reference, 'no-show', { reason: 'A different explanation' }).expect(409);
    const updated = await persisted(booking.id);
    expect(updated).toMatchObject({
      status: 'NO_SHOW',
      noShowByStaffUserId: receptionist.id,
      noShowReason: reason,
    });
    expect(updated.noShowAt).toBeInstanceOf(Date);
    expect(updated.assignments).toMatchObject([{ isActive: false }]);
    expect(updated.nights).toEqual(original.nights);
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 1 },
      { heldRooms: 0, bookedRooms: 0 },
      { heldRooms: 0, bookedRooms: 0 },
    ]);
    expect(await audits(booking.id)).toMatchObject([
      {
        eventName: 'BOOKING_NO_SHOW',
        actorStaffUserId: receptionist.id,
        reason,
        after: { status: 'NO_SHOW' },
      },
    ]);
  });

  it('rolls back all no-show changes if a later counter cannot be released', async () => {
    await inventory(today, 1);
    const booking = await stay();
    await assign(booking.id);
    await fixture.prisma.roomNightInventory.update({
      where: {
        roomTypeId_stayDate: { roomTypeId: property.type.id, stayDate: parseDateOnly(tomorrow) },
      },
      data: { bookedRooms: 0 },
    });
    const original = await persisted(booking.id);
    await action(booking.publicReference, 'no-show', { reason }).expect(500);
    expect(await persisted(booking.id)).toEqual(original);
    expect(await audits(booking.id)).toEqual([]);
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 1 },
      { heldRooms: 0, bookedRooms: 0 },
    ]);
  });

  it.each(['check-in', 'no-show'])('rolls back %s if the final audit write fails', async (name) => {
    await inventory(today, 1);
    const booking = await stay();
    await assign(booking.id);
    const original = await persisted(booking.id);
    const originalCounters = await counters();
    const record = jest
      .spyOn(AuditService.prototype, 'record')
      .mockRejectedValueOnce(new Error('Fixture audit failure'));
    try {
      await action(booking.publicReference, name, name === 'no-show' ? { reason } : {}).expect(500);
    } finally {
      record.mockRestore();
    }
    expect(await persisted(booking.id)).toEqual(original);
    expect(await counters()).toEqual(originalCounters);
    expect(await audits(booking.id)).toEqual([]);
  });

  it('serializes competing check-in and no-show actions on the booking', async () => {
    await inventory(today, 1);
    const booking = await stay();
    await assign(booking.id);
    const results = await Promise.all([
      action(booking.publicReference, 'check-in'),
      action(booking.publicReference, 'no-show', { reason }),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    const checkedIn = results[0].status === 200;
    expect(await persisted(booking.id)).toMatchObject({
      status: checkedIn ? 'CHECKED_IN' : 'NO_SHOW',
      assignments: [{ isActive: checkedIn }],
    });
    expect((await counters()).map(({ bookedRooms }) => bookedRooms)).toEqual(
      checkedIn ? [1, 1] : [0, 0],
    );
    expect(await audits(booking.id)).toHaveLength(1);
  });

  it('requires the capability and CSRF and exposes no checkout action', async () => {
    const booking = await stay();
    const reference = booking.publicReference;
    const headersWithoutCsrf = { Cookie: receptionist.headers.Cookie };
    for (const [name, body] of [
      ['check-in', {}],
      ['no-show', { reason }],
    ] as const) {
      await action(reference, name, body, housekeeper.headers).expect(403);
      await action(reference, name, body, headersWithoutCsrf).expect(403);
      await action(reference, name, body, {}).expect(401);
    }
    await fixture.client().post(walkInRoute).set(housekeeper.headers).send({}).expect(403);
    await action(reference, 'check-out').expect(404);
  });
});
