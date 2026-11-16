import { randomUUID } from 'node:crypto';
import { addDays } from '../src/availability/date-range';
import { Pool, PoolClient } from 'pg';
import { setTimeout } from 'node:timers/promises';
import { assignmentsRoute, bookingRoute, RoomBoardFixture } from './room-board-fixture';

describe('PostgreSQL room assignment invariants', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let f: RoomBoardFixture;
  let staff: Awaited<ReturnType<RoomBoardFixture['staff']>>;

  beforeAll(async () => {
    const result = await pool.query<{ database: string }>('SELECT current_database() AS database');
    expect(result.rows[0].database).toMatch(/_test$/);
    f = await RoomBoardFixture.start();
    staff = await f.staff('MANAGER');
  });
  afterAll(async () => {
    try {
      await f?.close();
    } finally {
      await pool.end();
    }
  });

  function interval(roomId: string, startDate = f.checkIn, endDate = f.checkOut) {
    return { roomId, startDate, endDate };
  }

  function replace(
    reference: string,
    assignments: ReturnType<typeof interval>[],
    expectedRevision: string,
    reason = f.reason,
    editor = staff,
  ) {
    return f
      .client()
      .put(assignmentsRoute(reference))
      .set(editor.headers)
      .send({ assignments, reason, expectedRevision });
  }

  function revisionFor(booking: { publicReference: string; roomTypeId: string }) {
    return f.assignmentRevision(booking, staff.headers);
  }

  function cancel(reference: string) {
    return f
      .client()
      .post(bookingRoute(reference) + '/cancel')
      .set(staff.headers)
      .send({ reason: 'Cancellation requested' });
  }

  async function holdRoom(roomId: string) {
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
    return client;
  }

  async function waitForDatabaseLock(queryText: string, directBlocker?: PoolClient) {
    const pid = directBlocker
      ? (await directBlocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid
      : null;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await pool.query<{ waiting: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND query LIKE '%' || $1 || '%'
            AND ($2::integer IS NULL OR $2 = ANY(pg_blocking_pids(pg_stat_activity.pid)))
        ) AS waiting
      `,
        [queryText, pid],
      );
      if (result.rows[0].waiting) return;
      await setTimeout(25);
    }
    throw new Error('Transaction did not wait on the held PostgreSQL row lock for ' + queryText);
  }

  it('releases active assignments, counters, and audit atomically on cancellation', async () => {
    const { type, rooms } = await f.createProperty();
    const booking = await f.booking(type.id, 2);
    await f.inventory(type.id, 2);
    const assigned = await f.prisma.roomAssignment.createManyAndReturn({
      data: [rooms[1], rooms[0]].map((room) => ({
        roomId: room.id,
        roomTypeId: type.id,
        bookingId: booking.id,
        startDate: booking.checkIn,
        endDate: booking.checkOut,
      })),
    });
    const targetIds = [booking.id, ...assigned.map(({ id }) => id)];
    const audit = () =>
      f.prisma.auditEvent.findMany({
        where: { targetId: { in: targetIds } },
        select: { eventName: true, targetId: true, before: true, after: true, reason: true },
      });
    const activeCount = () =>
      f.prisma.roomAssignment.count({
        where: { bookingId: booking.id, isActive: true },
      });
    const inventory = () =>
      f.prisma.roomNightInventory.findMany({
        where: { roomTypeId: type.id },
        orderBy: { stayDate: 'asc' },
        select: { bookedRooms: true },
      });

    await f.prisma.roomNightInventory.update({
      where: { roomTypeId_stayDate: { roomTypeId: type.id, stayDate: new Date(f.next) } },
      data: { bookedRooms: 1 },
    });
    await cancel(booking.publicReference).expect(500);
    expect(await activeCount()).toBe(2);
    expect(await inventory()).toEqual([{ bookedRooms: 2 }, { bookedRooms: 1 }]);
    expect(await audit()).toEqual([]);
    expect(await f.prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
      status: 'CONFIRMED',
      cancelledAt: null,
    });

    await f.prisma.roomNightInventory.updateMany({
      where: { roomTypeId: type.id },
      data: { bookedRooms: 2 },
    });
    await cancel(booking.publicReference).expect(200);
    await cancel(booking.publicReference).expect(200);
    expect(await activeCount()).toBe(0);
    expect(await inventory()).toEqual([{ bookedRooms: 0 }, { bookedRooms: 0 }]);
    expect(await audit()).toEqual(
      expect.arrayContaining([
        ...assigned.map(({ id }) => ({
          eventName: 'ROOM_ASSIGNMENT_RELEASED_ON_CANCELLATION',
          targetId: id,
          before: { isActive: true },
          after: { isActive: false },
          reason: null,
        })),
        {
          eventName: 'BOOKING_CANCEL',
          targetId: booking.id,
          before: { status: 'CONFIRMED' },
          after: { status: 'CANCELLED' },
          reason: 'Cancellation requested',
        },
      ]),
    );
    expect(await audit()).toHaveLength(3);
  });

  it('allows adjacent nights and rejects overlapping rooms or active blocks', async () => {
    const { type, rooms } = await f.createProperty();
    const first = await f.booking(type.id);
    const second = await f.booking(type.id);
    await f.prisma.roomBlock.create({
      data: {
        roomId: rooms[1].id,
        startDate: new Date(f.next),
        endDate: second.checkOut,
        reason: 'Fixture',
      },
    });
    await replace(
      first.publicReference,
      [interval(rooms[0].id, f.checkIn, f.next)],
      await revisionFor(first),
    ).expect(200);
    const overlap = await replace(
      second.publicReference,
      [interval(rooms[0].id)],
      await revisionFor(second),
    ).expect(409);
    expect(overlap.body).toMatchObject({ code: 'ROOM_ASSIGNMENT_OVERLAP' });
    await replace(
      second.publicReference,
      [interval(rooms[0].id, f.next)],
      await revisionFor(second),
    ).expect(200);
    const blocked = await replace(
      second.publicReference,
      [interval(rooms[1].id)],
      await revisionFor(second),
    ).expect(409);
    expect(blocked.body).toMatchObject({ code: 'ROOM_BLOCKED' });
    const adjacentBlock = await f.booking(type.id);
    await replace(
      adjacentBlock.publicReference,
      [interval(rooms[1].id, f.checkIn, f.next)],
      await revisionFor(adjacentBlock),
    ).expect(200);
  });

  it('allows one distinct assigned room per unit and leaves booking and inventory untouched', async () => {
    const { hotel, type, rooms } = await f.createProperty();
    const otherType = await f.roomType(hotel.id);
    const wrongRoom = await f.prisma.room.create({
      data: { hotelId: hotel.id, roomTypeId: otherType.id, roomNumber: '999' },
    });
    const booking = await f.booking(type.id, 2);
    await f.inventory(type.id, 2);
    const reference = booking.publicReference;
    const inventory = () =>
      f.prisma.roomNightInventory.findMany({
        where: { roomTypeId: type.id },
        orderBy: { stayDate: 'asc' },
      });
    const before = await inventory();
    const expectedRevision = await revisionFor(booking);

    const wrongType = await replace(reference, [interval(wrongRoom.id)], expectedRevision).expect(
      409,
    );
    expect(wrongType.body).toMatchObject({ code: 'ROOM_TYPE_MISMATCH' });
    const outside = await replace(
      reference,
      [interval(rooms[0].id, addDays(f.checkIn, -1))],
      expectedRevision,
    ).expect(409);
    expect(outside.body).toMatchObject({ code: 'ROOM_ASSIGNMENT_OUTSIDE_BOOKING' });

    const desired = [interval(rooms[0].id, f.checkIn, f.next), interval(rooms[1].id)];
    const [first, replay] = await Promise.all([
      replace(reference, desired, expectedRevision).expect(200),
      replace(reference, [...desired].reverse(), expectedRevision).expect(200),
    ]);
    expect(replay.body).toEqual(first.body);
    const { assignments, revision } = first.body as {
      assignments: Array<{ id: string; roomId: string }>;
      revision: string;
    };
    const { id } = assignments.find((entry) => entry.roomId === rooms[0].id)!;
    const duplicate = await replace(
      reference,
      [...desired, interval(rooms[0].id, f.next)],
      revision,
    ).expect(409);
    expect(duplicate.body).toMatchObject({ code: 'ROOM_ASSIGNMENT_DUPLICATE_ROOM' });
    const limit = await replace(reference, [...desired, interval(rooms[2].id)], revision).expect(
      409,
    );
    expect(limit.body).toMatchObject({ code: 'ROOM_ASSIGNMENT_LIMIT' });

    const unassign = () => replace(reference, [], revision, 'Allocation corrected').expect(200);
    const result = await unassign();
    const repeated = await unassign();
    expect(repeated.body).toEqual(result.body);
    expect(result.body).toEqual({ revision: expectedRevision, assignments: [] });
    expect(await f.prisma.roomAssignment.findUnique({ where: { id } })).toMatchObject({
      isActive: false,
      changeReason: f.reason,
    });
    expect(
      await f.prisma.auditEvent.findMany({
        where: { targetId: id },
        orderBy: { createdAt: 'asc' },
        select: { eventName: true, reason: true, before: true, after: true },
      }),
    ).toEqual([
      { eventName: 'ROOM_ASSIGNED', reason: f.reason, before: null, after: { isActive: true } },
      {
        eventName: 'ROOM_UNASSIGNED',
        reason: 'Allocation corrected',
        before: { isActive: true },
        after: { isActive: false },
      },
    ]);
    expect(await inventory()).toEqual(before);
    expect(await f.prisma.booking.findUnique({ where: { id: booking.id } })).toEqual(booking);
  });

  it('leaves the previous set and audit untouched when a room in a replacement is blocked', async () => {
    const { type, rooms } = await f.createProperty();
    const booking = await f.booking(type.id, 2);
    const reference = booking.publicReference;
    const expectedRevision = await revisionFor(booking);
    const original = await replace(reference, [interval(rooms[0].id)], expectedRevision).expect(
      200,
    );
    const { revision } = original.body as { revision: string };
    await f.prisma.roomBlock.create({
      data: {
        roomId: rooms[2].id,
        startDate: booking.checkIn,
        endDate: booking.checkOut,
        reason: 'Fixture',
      },
    });
    const failed = await replace(
      reference,
      [interval(rooms[1].id), interval(rooms[2].id)],
      revision,
    ).expect(409);
    expect(failed.body).toMatchObject({ code: 'ROOM_BLOCKED' });

    const replay = await replace(reference, [interval(rooms[0].id)], expectedRevision).expect(200);
    expect(replay.body).toEqual(original.body);
    const actual = await f.prisma.roomAssignment.findMany({ where: { bookingId: booking.id } });
    expect(actual).toMatchObject([{ roomId: rooms[0].id, isActive: true }]);
    expect(await f.prisma.auditEvent.count({ where: { targetId: actual[0].id } })).toBe(1);

    const swapped = await replace(
      reference,
      [interval(rooms[0].id, f.next), interval(rooms[1].id)],
      revision,
    ).expect(200);
    const { assignments } = swapped.body as { assignments: unknown[] };
    expect(assignments).toHaveLength(2);
    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ roomId: rooms[0].id, startDate: f.next }),
        expect.objectContaining({ roomId: rooms[1].id, startDate: f.checkIn }),
      ]),
    );
    expect(await f.prisma.roomAssignment.findUnique({ where: { id: actual[0].id } })).toMatchObject(
      { isActive: false },
    );
  });

  it('keeps the first edit and its audit when two staff replace from one revision', async () => {
    const { type, rooms } = await f.createProperty();
    const booking = await f.booking(type.id);
    const reference = booking.publicReference;
    const competingStaff = await f.staff('RECEPTIONIST');
    const expectedRevision = await revisionFor(booking);
    const lock = await holdRoom(rooms[0].id);
    let firstEdit: PromiseLike<unknown> | undefined;
    let competingEdit: PromiseLike<unknown> | undefined;
    try {
      firstEdit = replace(
        reference,
        [interval(rooms[0].id)],
        expectedRevision,
        'First editor',
      ).then(({ status, body }) => ({ status, body: body as unknown }));
      await waitForDatabaseLock('FROM "rooms"', lock);
      competingEdit = replace(
        reference,
        [interval(rooms[1].id)],
        expectedRevision,
        'Second editor',
        competingStaff,
      ).then(({ status, body }) => ({ status, body: body as unknown }));
      await waitForDatabaseLock('WHERE public_reference =');
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
      await Promise.allSettled([firstEdit, competingEdit]);
    }

    expect(await firstEdit).toMatchObject({
      status: 200,
      body: { assignments: [{ roomId: rooms[0].id }] },
    });
    expect(await competingEdit).toMatchObject({
      status: 409,
      body: { code: 'ROOM_ASSIGNMENT_STALE' },
    });
    const assignmentRows = await f.prisma.roomAssignment.findMany({
      where: { bookingId: booking.id },
      select: { id: true, roomId: true, isActive: true },
    });
    expect(assignmentRows).toMatchObject([{ roomId: rooms[0].id, isActive: true }]);
    expect(
      await f.prisma.auditEvent.findMany({
        where: { targetId: { in: assignmentRows.map(({ id }) => id) } },
        select: { eventName: true, reason: true },
      }),
    ).toEqual([{ eventName: 'ROOM_ASSIGNED', reason: 'First editor' }]);
  });

  it('serializes competing bookings even when callers send the same rooms in reversed order', async () => {
    const { type, rooms } = await f.createProperty();
    const first = await f.booking(type.id, 2);
    const second = await f.booking(type.id, 2);
    const desired = [interval(rooms[0].id), interval(rooms[1].id)];
    const results = await Promise.all([
      replace(first.publicReference, desired, await revisionFor(first)),
      replace(second.publicReference, [...desired].reverse(), await revisionFor(second)),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(results.find(({ status }) => status === 409)?.body).toMatchObject({
      code: 'ROOM_ASSIGNMENT_OVERLAP',
    });
    const assignments = await f.prisma.roomAssignment.findMany({
      where: { bookingId: { in: [first.id, second.id] }, isActive: true },
    });
    expect(assignments).toHaveLength(2);
    expect(new Set(assignments.map(({ bookingId }) => bookingId)).size).toBe(1);
  });

  it('serializes assignment and physical room deactivation behind the same row lock', async () => {
    const { type, rooms } = await f.createProperty();
    const booking = await f.booking(type.id);
    const room = rooms[0];
    const expectedRevision = await revisionFor(booking);
    const lock = await holdRoom(room.id);
    let allocation: PromiseLike<unknown> | undefined;
    let deactivation: PromiseLike<unknown> | undefined;
    try {
      allocation = replace(booking.publicReference, [interval(room.id)], expectedRevision)
        .expect(200)
        .then((result) => result.body as unknown);
      await waitForDatabaseLock('FROM "rooms"', lock);
      deactivation = f
        .client()
        .post('/api/v1/staff/rooms/' + room.id + '/deactivate')
        .set(staff.headers)
        .expect(409)
        .then((result) => result.body as unknown);
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
      await Promise.allSettled([allocation, deactivation]);
    }
    expect(await deactivation).toMatchObject({ code: 'ROOM_HAS_ACTIVE_ASSIGNMENTS' });
    expect(await f.prisma.room.findUnique({ where: { id: room.id } })).toMatchObject({
      isActive: true,
    });
  });

  it('does not deadlock a public booking insert that already holds inventory locks', async () => {
    const { type } = await f.createProperty();
    const booking = await f.booking(type.id);
    await f.inventory(type.id);
    const lock = await pool.connect();
    const idempotencyKey = 'booking-room-assignment-' + randomUUID();
    const submit = () =>
      f.client().post('/api/v1/bookings').set('Idempotency-Key', idempotencyKey).send({
        roomTypeSlug: type.slug,
        checkIn: f.checkIn,
        checkOut: f.checkOut,
        guestCount: 1,
        roomQuantity: 1,
        guestName: 'Public request',
        guestPhone: '+989121234567',
      });
    let submission: PromiseLike<unknown> | undefined;
    let cancellation: PromiseLike<unknown> | undefined;
    try {
      await lock.query('BEGIN');
      await lock.query(
        'SELECT id FROM room_night_inventory WHERE room_type_id = $1 AND stay_date = $2 FOR UPDATE',
        [type.id, f.checkIn],
      );
      submission = submit()
        .expect(201)
        .then((result) => result.body as unknown);
      await waitForDatabaseLock('FROM room_night_inventory', lock);
      cancellation = cancel(booking.publicReference)
        .expect(200)
        .then((result) => result.body as unknown);
      await waitForDatabaseLock('INNER JOIN booking_nights AS booking_night');
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
      await Promise.allSettled([submission, cancellation]);
    }
    expect(await cancellation).toMatchObject({ status: 'CANCELLED' });
    expect((await submit().expect(201)).body).toEqual(await submission);
    expect(
      await f.prisma.roomNightInventory.findMany({
        where: { roomTypeId: type.id },
        select: { heldRooms: true, bookedRooms: true },
      }),
    ).toEqual([
      { heldRooms: 1, bookedRooms: 0 },
      { heldRooms: 1, bookedRooms: 0 },
    ]);
  });

  it('rechecks confirmation after waiting for cancellation and its physical room locks', async () => {
    const { type, rooms } = await f.createProperty();
    const booking = await f.booking(type.id, 2);
    await f.inventory(type.id, 2);
    const existing = await f.prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomTypeId: type.id,
        roomId: rooms[0].id,
        startDate: booking.checkIn,
        endDate: booking.checkOut,
      },
    });

    const expectedRevision = await revisionFor(booking);
    const lock = await holdRoom(rooms[0].id);
    let cancellation: PromiseLike<unknown> | undefined;
    let allocation: PromiseLike<unknown> | undefined;
    try {
      cancellation = cancel(booking.publicReference)
        .expect(200)
        .then((result) => result.body as unknown);
      await waitForDatabaseLock('FROM "rooms"', lock);
      allocation = replace(booking.publicReference, [interval(rooms[1].id)], expectedRevision)
        .expect(409)
        .then((result) => result.body as unknown);
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
      await Promise.allSettled([cancellation, allocation]);
    }
    expect(await cancellation).toMatchObject({ status: 'CANCELLED' });
    expect(await allocation).toMatchObject({ code: 'BOOKING_STATUS_CONFLICT' });
    expect(
      await f.prisma.roomAssignment.findMany({ where: { bookingId: booking.id } }),
    ).toMatchObject([{ id: existing.id, isActive: false }]);
  });
});
