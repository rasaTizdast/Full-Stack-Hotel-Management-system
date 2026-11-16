import { randomUUID } from 'node:crypto';
import { addDays } from '../src/availability/date-range';
import { assignmentsRoute, boardRoute, RoomBoardFixture } from './room-board-fixture';

describe('Staff room board HTTP API', () => {
  let f: RoomBoardFixture;
  let reception: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let housekeeping: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let cashier: Awaited<ReturnType<RoomBoardFixture['staff']>>;

  beforeAll(async () => {
    f = await RoomBoardFixture.start();
    [reception, housekeeping, cashier] = await Promise.all([
      f.staff('RECEPTIONIST'),
      f.staff('HOUSEKEEPER'),
      f.staff('CASHIER'),
    ]);
  }, 30000);
  afterAll(async () => f?.close());

  it('requires a session, capability, and CSRF proof and keeps staff responses private', async () => {
    const route = assignmentsRoute(randomUUID().slice(0, 16));
    await f.client().get(boardRoute).expect(401).expect('Cache-Control', 'private, no-store');
    await f.client().put(route).expect(401).expect('Cache-Control', 'private, no-store');

    for (const staff of [housekeeping, cashier]) {
      await f.client().get(boardRoute).set(staff.headers).expect(403);
      await f.client().put(route).set(staff.headers).expect(403);
    }
    await f.client().put(route).set('Cookie', reception.headers.Cookie).expect(403);
  });

  it('defaults the board to the property business date', async () => {
    const { type, rooms } = await f.createProperty('Pacific/Kiritimati');
    const expected = new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const response = await f
      .client()
      .get(boardRoute)
      .set(reception.headers)
      .query({ roomTypeId: type.id })
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(response.body).toMatchObject({
      date: expected,
      businessDate: expected,
      items: rooms.map(({ id }) => ({ id, occupancy: 'VACANT' })),
    });
  });

  it('separates reservation context from occupancy and applies board filters', async () => {
    const { type, rooms } = await f.createProperty();
    const booking = await f.booking(type.id, 2);
    const route = assignmentsRoute(booking.publicReference);
    const assign = await f
      .client()
      .put(route)
      .set(reception.headers)
      .send({
        assignments: [
          { roomId: rooms[0].id, startDate: f.checkIn, endDate: f.checkOut },
          { roomId: rooms[2].id, startDate: f.next, endDate: f.checkOut },
        ],
        reason: f.reason,
      })
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    const assignmentId = (
      assign.body as { assignments: Array<{ id: string; roomId: string }> }
    ).assignments.find(({ roomId }) => roomId === rooms[0].id)!.id;
    const block = await f.prisma.roomBlock.create({
      data: {
        roomId: rooms[1].id,
        startDate: booking.checkIn,
        endDate: booking.checkOut,
        reason: 'Fixtures only',
      },
    });

    const board = (date: string, filters: Record<string, string> = {}) =>
      f
        .client()
        .get(boardRoute)
        .set(reception.headers)
        .query({ date, roomTypeId: type.id, ...filters })
        .expect(200);

    const arrivals = await board(f.checkIn, {
      floor: '1',
      housekeepingStatus: 'INSPECTED',
      stayContext: 'ARRIVING',
      blockKind: 'NONE',
    });
    expect(arrivals.body).toMatchObject({
      items: [
        {
          id: rooms[0].id,
          occupancy: 'UNKNOWN',
          reservationContexts: [
            {
              assignmentId,
              reference: booking.publicReference,
              guestName: booking.guestName,
              stayContext: 'ARRIVING',
            },
          ],
          blocks: [],
        },
      ],
      assignableBookings: [
        {
          reference: booking.publicReference,
          roomTypeId: type.id,
          roomTypeName: type.name,
          roomQuantity: 2,
          unassignedRoomQuantity: 1,
        },
      ],
    });
    const { assignableBookings } = arrivals.body as {
      assignableBookings: [{ assignments: unknown[] }];
    };
    expect(assignableBookings[0].assignments).toHaveLength(2);
    expect(assignableBookings[0].assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ roomId: rooms[0].id, startDate: f.checkIn }),
        expect.objectContaining({
          roomId: rooms[2].id,
          roomNumber: '201',
          startDate: f.next,
          endDate: f.checkOut,
        }),
      ]),
    );
    expect(arrivals.text).not.toMatch(/guestPhone|guestEmail|989121234567|guest@example\.invalid/);

    const inRange = await board(f.next, { stayContext: 'RESERVED', floor: '1' });
    expect(inRange.body).toMatchObject({
      items: [{ id: rooms[0].id, occupancy: 'UNKNOWN' }],
      assignableBookings: [{ reference: booking.publicReference, unassignedRoomQuantity: 0 }],
    });
    const blocked = await board(f.next, { stayContext: 'NONE', blockKind: 'OUT_OF_ORDER' });
    expect(blocked.body).toMatchObject({
      items: [{ id: rooms[1].id, blocks: [{ id: block.id }] }],
    });

    const departing = await board(f.checkOut, { stayContext: 'DEPARTING', floor: '1' });
    expect(departing.body).toMatchObject({
      items: [
        {
          id: rooms[0].id,
          occupancy: 'UNKNOWN',
          reservationContexts: [{ stayContext: 'DEPARTING' }],
        },
      ],
      assignableBookings: [],
    });
    const afterDeparture = await board(addDays(f.checkOut, 1), { stayContext: 'NONE' });
    expect(afterDeparture.body).toMatchObject({
      items: [
        { id: rooms[0].id, occupancy: 'VACANT', reservationContexts: [] },
        { id: rooms[1].id, blocks: [] },
        { id: rooms[2].id },
      ],
    });

    await f
      .client()
      .put(route)
      .set(reception.headers)
      .send({ assignments: [], reason: 'Allocation corrected' })
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    const unassigned = await board(f.checkIn);
    expect(unassigned.body).toMatchObject({
      assignableBookings: [{ reference: booking.publicReference, unassignedRoomQuantity: 2 }],
    });
  });

  it('filters by occupancy independently of reservation context', async () => {
    const { type, rooms } = await f.createProperty();
    const booking = await f.booking(type.id);
    await f
      .client()
      .put(assignmentsRoute(booking.publicReference))
      .set(reception.headers)
      .send({
        assignments: [{ roomId: rooms[0].id, startDate: f.checkIn, endDate: f.checkOut }],
        reason: f.reason,
      })
      .expect(200);
    const board = (occupancy: string) =>
      f
        .client()
        .get(boardRoute)
        .set(reception.headers)
        .query({ date: f.checkIn, roomTypeId: type.id, occupancy })
        .expect(200);
    expect((await board('UNKNOWN')).body).toMatchObject({
      items: [{ id: rooms[0].id, occupancy: 'UNKNOWN' }],
    });
    expect((await board('VACANT')).body).toMatchObject({
      items: [
        { id: rooms[1].id, occupancy: 'VACANT' },
        { id: rooms[2].id, occupancy: 'VACANT' },
      ],
    });
    expect((await board('OCCUPIED')).body).toMatchObject({ items: [] });
  });

  it('requires a nonblank reason and validates every interval in the desired set', async () => {
    const { type } = await f.createProperty();
    const booking = await f.booking(type.id);
    for (const body of [
      { assignments: [] },
      { assignments: [], reason: '  ' },
      { assignments: [null], reason: f.reason },
    ]) {
      const response = await f
        .client()
        .put(assignmentsRoute(booking.publicReference))
        .set(reception.headers)
        .send(body)
        .expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });

  it('rejects malformed, impossible, and empty date intervals', async () => {
    const { type, rooms } = await f.createProperty();
    const booking = await f.booking(type.id);
    for (const [startDate, endDate] of [
      ['2026-02-30', f.checkOut],
      [f.checkIn + 'T00:00:00.000Z', f.checkOut],
      [f.checkOut, f.checkOut],
      [f.checkOut, f.checkIn],
    ]) {
      await f
        .client()
        .put(assignmentsRoute(booking.publicReference))
        .set(reception.headers)
        .send({ assignments: [{ roomId: rooms[0].id, startDate, endDate }], reason: f.reason })
        .expect(400);
    }
    await f
      .client()
      .get(boardRoute)
      .set(reception.headers)
      .query({ date: '2026-02-30' })
      .expect(400);
  });
});
