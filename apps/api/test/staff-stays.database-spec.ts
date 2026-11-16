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

  function amend(reference: string, body: Record<string, unknown>) {
    return fixture.client().patch(bookingRoute(reference)).set(receptionist.headers).send(body);
  }

  function move(reference: string, targetIndex = 1, moveReason: unknown = 'Room repair needed') {
    return action(reference, 'room-move', {
      sourceRoomId: property.rooms[0].id,
      targetRoomId: property.rooms[targetIndex].id,
      reason: moveReason,
    });
  }

  async function inspectTarget() {
    await fixture.prisma.room.update({
      where: { id: property.rooms[1].id },
      data: { housekeepingStatus: 'INSPECTED' },
    });
  }

  function sourceRoom() {
    return fixture.prisma.room.findUniqueOrThrow({ where: { id: property.rooms[0].id } });
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

  it('amends a same-day confirmed stay before configured check-in and preserves retained rates', async () => {
    await setCheckInTime('23:59');
    await inventory(today, 0);
    await fixture.prisma.roomNightInventory.update({
      where: {
        roomTypeId_stayDate: { roomTypeId: property.type.id, stayDate: parseDateOnly(today) },
      },
      data: { bookedRooms: 1, nightlyPriceToman: 400_000n },
    });
    const booking = await stay(today, tomorrow);
    const original = await persisted(booking.id);
    const changes = { checkOut: dayAfter, roomQuantity: 2, guestCount: 3, guestEmail: null };
    const replies = await Promise.all([
      amend(booking.publicReference, changes).expect(200),
      amend(booking.publicReference, changes).expect(200),
    ]);
    expect(replies[0].body as unknown).toEqual(replies[1].body as unknown);
    const result = await persisted(booking.id);
    expect(result).toMatchObject({
      status: 'CONFIRMED',
      roomQuantity: 2,
      guestCount: 3,
      guestEmail: null,
      totalPriceToman: 500_000n,
      nights: [
        {
          id: original.nights[0].id,
          nightlyPriceToman: 100_000n,
          roomQuantity: 2,
          amountToman: 200_000n,
        },
        { nightlyPriceToman: 150_000n, roomQuantity: 2, amountToman: 300_000n },
      ],
    });
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 2 },
      { heldRooms: 0, bookedRooms: 2 },
    ]);
    expect(await audits(booking.id)).toMatchObject([
      { eventName: 'BOOKING_AMENDED', actorStaffUserId: receptionist.id },
    ]);
  });

  it('releases removed nights and applies negative quantity deltas to retained future nights', async () => {
    const lastDate = addDays(dayAfter, 1);
    await inventory(tomorrow, 2);
    await fixture.prisma.roomNightInventory.create({
      data: {
        roomTypeId: property.type.id,
        stayDate: parseDateOnly(dayAfter),
        totalRooms: 3,
        nightlyPriceToman: 300_000n,
      },
    });
    const booking = await stay(tomorrow, dayAfter, 2);
    await amend(booking.publicReference, { checkOut: lastDate }).expect(200);
    await amend(booking.publicReference, { checkIn: dayAfter, roomQuantity: 1 }).expect(200);
    expect(await persisted(booking.id)).toMatchObject({
      checkIn: parseDateOnly(dayAfter),
      checkOut: parseDateOnly(lastDate),
      roomQuantity: 1,
      totalPriceToman: 300_000n,
      nights: [{ stayDate: parseDateOnly(dayAfter), roomQuantity: 1, amountToman: 300_000n }],
    });
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 0 },
      { heldRooms: 0, bookedRooms: 1 },
    ]);
  });

  it('rolls back the amendment if an added night is sold out, then allows a retry', async () => {
    await inventory(today, 1, 2);
    const booking = await stay(today, tomorrow);
    const original = await persisted(booking.id);
    const newNight = { roomTypeId: property.type.id, stayDate: parseDateOnly(tomorrow) };
    await fixture.prisma.roomNightInventory.update({
      where: { roomTypeId_stayDate: newNight },
      data: { heldRooms: 1 },
    });
    const res = await amend(booking.publicReference, {
      checkOut: dayAfter,
      roomQuantity: 2,
    }).expect(409);
    expect(res.body as unknown).toMatchObject({ code: 'AVAILABILITY_CHANGED' });
    expect(await persisted(booking.id)).toEqual(original);
    expect(await audits(booking.id)).toEqual([]);
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 1 },
      { heldRooms: 1, bookedRooms: 1 },
    ]);
    await fixture.prisma.roomNightInventory.update({
      where: { roomTypeId_stayDate: newNight },
      data: { heldRooms: 0, totalRooms: 3 },
    });
    await amend(booking.publicReference, { checkOut: dayAfter, roomQuantity: 2 }).expect(200);
    expect(await counters()).toEqual([
      { heldRooms: 0, bookedRooms: 2 },
      { heldRooms: 0, bookedRooms: 3 },
    ]);
  });

  it('keeps a valid active interval when an extension creates an unassigned night and unit', async () => {
    await inventory(today, 0);
    await fixture.prisma.roomNightInventory.update({
      where: {
        roomTypeId_stayDate: { roomTypeId: property.type.id, stayDate: parseDateOnly(today) },
      },
      data: { bookedRooms: 1 },
    });
    const booking = await stay(today, tomorrow);
    const assignment = await assign(booking.id, 0, today, tomorrow);
    await amend(booking.publicReference, { checkOut: dayAfter, roomQuantity: 2 }).expect(200);
    expect((await persisted(booking.id)).assignments).toEqual([assignment]);
    const checkIn = await action(booking.publicReference, 'check-in').expect(409);
    expect(checkIn.body as unknown).toMatchObject({ code: 'ROOM_ASSIGNMENT_INCOMPLETE' });
  });

  it('rejects an amendment when an existing active interval conflicts with a block', async () => {
    await inventory(today, 1);
    const booking = await stay(today, tomorrow);
    await assign(booking.id, 0, today, tomorrow);
    await fixture.prisma.roomBlock.create({
      data: {
        roomId: property.rooms[0].id,
        startDate: parseDateOnly(today),
        endDate: parseDateOnly(tomorrow),
        reason: 'Fixture repair',
      },
    });
    const original = await persisted(booking.id);
    const result = await amend(booking.publicReference, { checkOut: dayAfter }).expect(409);
    expect(result.body as unknown).toMatchObject({ code: 'ROOM_BLOCKED' });
    expect(await persisted(booking.id)).toEqual(original);
  });

  it('rejects amendments that would invalidate active assignments', async () => {
    await inventory(today, 2);
    const booking = await stay(today, dayAfter, 2);
    await assign(booking.id);
    await assign(booking.id, 1);
    const original = await persisted(booking.id);
    const smaller = await amend(booking.publicReference, { roomQuantity: 1 }).expect(409);
    const shorter = await amend(booking.publicReference, { checkIn: tomorrow }).expect(409);
    expect(smaller.body as unknown).toMatchObject({ code: 'ROOM_ASSIGNMENT_LIMIT' });
    expect(shorter.body as unknown).toMatchObject({ code: 'ROOM_ASSIGNMENT_OUTSIDE_BOOKING' });
    expect(await persisted(booking.id)).toEqual(original);
    expect((await counters()).map(({ bookedRooms }) => bookedRooms)).toEqual([2, 2]);
  });

  it('rejects edits to overdue, no-showed, checked-in, and checked-out stays', async () => {
    for (const booking of [
      await stay(yesterday),
      await stay(yesterday, today),
      await stay(today, dayAfter, 1, 'NO_SHOW'),
      await stay(today, dayAfter, 1, 'CHECKED_IN'),
      await stay(today, dayAfter, 1, 'CHECKED_OUT'),
    ]) {
      await amend(booking.publicReference, { guestName: 'Changed Name' }).expect(409);
      expect((await persisted(booking.id)).guestName).toBe(guest.guestName);
    }
  });

  it('rolls back amendment counters, snapshots, and contact changes when the audit fails', async () => {
    await inventory(today, 1);
    const booking = await stay(today, tomorrow);
    const original = await persisted(booking.id);
    const originalCounters = await counters();
    const record = jest
      .spyOn(AuditService.prototype, 'record')
      .mockRejectedValueOnce(new Error('Fixture audit failure'));
    try {
      await amend(booking.publicReference, { roomQuantity: 2, guestName: 'Changed Name' }).expect(
        500,
      );
    } finally {
      record.mockRestore();
    }
    expect(await persisted(booking.id)).toEqual(original);
    expect(await counters()).toEqual(originalCounters);
    expect(await audits(booking.id)).toEqual([]);
  });

  it.each(['later', 'same'])('preserves nonzero source history for a %s-day move', async (when) => {
    await inspectTarget();
    const start = when === 'later' ? yesterday : today;
    await inventory(start, 1);
    const booking = await stay(start, dayAfter, 1, 'CHECKED_IN');
    const source = await assign(booking.id, 0, start);
    const original = await persisted(booking.id);
    const originalCounters = await counters();
    const result = await move(booking.publicReference, 1, '  Room repair needed  ').expect(200);
    expect(result.body as unknown).toMatchObject({
      status: 'CHECKED_IN',
      checkIn: start,
      checkOut: dayAfter,
    });
    const updated = await persisted(booking.id);
    expect(updated.totalPriceToman).toBe(original.totalPriceToman);
    expect(updated.nights).toEqual(original.nights);
    expect(updated.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: source.id,
          startDate: parseDateOnly(start),
          endDate: parseDateOnly(when === 'later' ? today : dayAfter),
          isActive: false,
        }),
        expect.objectContaining({
          roomId: property.rooms[1].id,
          startDate: parseDateOnly(today),
          endDate: parseDateOnly(dayAfter),
          isActive: true,
          assignedByStaffUserId: receptionist.id,
          changeReason: 'Room repair needed',
        }),
      ]),
    );
    expect(updated.assignments).toHaveLength(2);
    expect((await sourceRoom()).housekeepingStatus).toBe('DIRTY');
    expect(await counters()).toEqual(originalCounters);
    expect(await audits(booking.id)).toMatchObject([
      {
        actorStaffUserId: receptionist.id,
        eventName: 'BOOKING_ROOM_MOVE',
        reason: 'Room repair needed',
        before: { roomId: property.rooms[0].id },
        after: { roomId: property.rooms[1].id, effectiveDate: today },
      },
    ]);
  });

  it('rejects blank reasons, unavailable targets, a confirmed stay, and a departure-day move', async () => {
    const booking = await stay(today, dayAfter, 1, 'CHECKED_IN');
    const confirmed = await stay();
    const departing = await stay(yesterday, today, 1, 'CHECKED_IN');
    await assign(booking.id);
    await assign(departing.id, 0, yesterday, today);
    const original = await persisted(booking.id);
    const missing = await move(booking.publicReference, 1, '  ').expect(400);
    expect(missing.body as unknown).toMatchObject({ code: 'ROOM_MOVE_REASON_REQUIRED' });
    const dirty = await move(booking.publicReference).expect(409);
    expect(dirty.body as unknown).toMatchObject({ code: 'ROOM_NOT_INSPECTED' });
    await move(booking.publicReference, 0).expect(409);
    await inspectTarget();
    await move(confirmed.publicReference).expect(409);
    await move(departing.publicReference).expect(409);
    await fixture.prisma.room.update({
      where: { id: property.rooms[1].id },
      data: { isActive: false },
    });
    const inactive = await move(booking.publicReference).expect(409);
    expect(inactive.body as unknown).toMatchObject({ code: 'ROOM_INACTIVE' });
    const otherType = await fixture.roomType(property.hotel.id);
    const otherRoom = await fixture.prisma.room.create({
      data: {
        hotelId: property.hotel.id,
        roomTypeId: otherType.id,
        roomNumber: '777',
        floor: '7',
        housekeepingStatus: 'INSPECTED',
      },
    });
    const sendTarget = (targetRoomId: string) =>
      action(booking.publicReference, 'room-move', {
        sourceRoomId: property.rooms[0].id,
        targetRoomId,
        reason: 'Room repair',
      });
    const wrongType = await sendTarget(otherRoom.id).expect(409);
    expect(wrongType.body as unknown).toMatchObject({ code: 'ROOM_TYPE_MISMATCH' });
    await sendTarget(randomUUID()).expect(404);
    expect(await persisted(booking.id)).toEqual(original);
    expect(await audits(booking.id)).toEqual([]);
  });

  it.each(['block', 'other booking', 'same booking'])(
    'rejects a target with a future %s conflict',
    async (conflict) => {
      await inspectTarget();
      const multiRoom = conflict === 'same booking';
      const booking = await stay(today, dayAfter, multiRoom ? 2 : 1, 'CHECKED_IN');
      await assign(booking.id);
      if (conflict === 'block') {
        await fixture.prisma.roomBlock.create({
          data: {
            roomId: property.rooms[1].id,
            startDate: parseDateOnly(tomorrow),
            endDate: parseDateOnly(dayAfter),
            reason: 'Fixture repair',
          },
        });
      } else {
        const other = multiRoom ? booking : await stay(tomorrow);
        await assign(other.id, 1, tomorrow);
      }
      const original = await persisted(booking.id);
      const res = await move(booking.publicReference).expect(409);
      expect(res.body as unknown).toMatchObject({
        code: conflict === 'block' ? 'ROOM_BLOCKED' : 'ROOM_ASSIGNMENT_OVERLAP',
      });
      expect(await persisted(booking.id)).toEqual(original);
      expect((await sourceRoom()).housekeepingStatus).toBe('INSPECTED');
    },
  );

  it('rolls back a move when audit fails and applies a concurrent retry only once', async () => {
    await inspectTarget();
    const booking = await stay(today, dayAfter, 1, 'CHECKED_IN');
    await assign(booking.id);
    const original = await persisted(booking.id);
    const record = jest
      .spyOn(AuditService.prototype, 'record')
      .mockRejectedValueOnce(new Error('Fixture audit failure'));
    try {
      await move(booking.publicReference).expect(500);
    } finally {
      record.mockRestore();
    }
    expect(await persisted(booking.id)).toEqual(original);
    expect((await sourceRoom()).housekeepingStatus).toBe('INSPECTED');
    expect(await audits(booking.id)).toEqual([]);
    const retries = await Promise.all([
      move(booking.publicReference),
      move(booking.publicReference),
    ]);
    expect(retries.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect((await persisted(booking.id)).assignments).toHaveLength(2);
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
