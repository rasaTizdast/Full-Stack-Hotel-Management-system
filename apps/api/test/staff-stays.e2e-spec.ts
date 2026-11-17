import { randomUUID } from 'node:crypto';
import { addDays } from '../src/availability/date-range';
import {
  bookingRoute,
  RoomBoardFixture,
  type RoomBoardFixture as RoomBoardFixtureType,
} from './room-board-fixture';

const worklistRoutes = [
  '/api/v1/staff/front-desk/arrivals',
  '/api/v1/staff/front-desk/in-house',
  '/api/v1/staff/front-desk/departures',
] as const;

type StayFixture = {
  reference: string;
  status: 'CONFIRMED' | 'CHECKED_IN';
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  assignmentId?: string;
};

type StayWorklistItem = {
  reference: string;
  status: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomQuantity: number;
  roomType: { id: string; name: string };
  confirmedAt: string | null;
  checkedInAt: string | null;
  assignedRooms: Array<{
    assignmentId: string;
    roomNumber: string;
    housekeepingStatus: string;
    startDate: string;
    endDate: string;
  }>;
};

type StayWorklist = {
  date: string;
  businessDate: string;
  items: StayWorklistItem[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

function dateAtTimeZone(timeZone: string, instant = new Date()): string {
  const parts = new Map(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`;
}

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function bodyOf<T>(body: unknown): T {
  if (typeof body !== 'object' || body === null) throw new Error('Expected an object response.');
  return body as T;
}

describe('Staff stay worklists HTTP API', () => {
  const timeZone = 'Pacific/Kiritimati';
  let f: RoomBoardFixtureType;
  let receptionist: Awaited<ReturnType<RoomBoardFixtureType['staff']>>;
  let cashier: Awaited<ReturnType<RoomBoardFixtureType['staff']>>;
  let hotelBusinessDate: string;
  let nextDate: string;
  let checkoutEdgeDate: string;
  let literalSearchDate: string;
  let tieBreakDate: string;
  let roomType: Awaited<ReturnType<RoomBoardFixtureType['createProperty']>>['type'];
  let rooms: Awaited<ReturnType<RoomBoardFixtureType['createProperty']>>['rooms'];
  const stays: Record<string, StayFixture> = {};

  async function createStay(
    key: string,
    status: StayFixture['status'],
    checkIn: string,
    checkOut: string,
    guestName: string,
    roomIndex?: number,
    referenceOverride?: string,
  ): Promise<StayFixture> {
    const reference =
      referenceOverride ?? randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
    const guestPhone = `+98912${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const guestEmail = `${randomUUID()}@example.invalid`;
    const now = new Date();
    const booking = await f.prisma.booking.create({
      data: {
        publicReference: reference,
        status,
        checkIn: asDate(checkIn),
        checkOut: asDate(checkOut),
        guestCount: 1,
        roomTypeId: roomType.id,
        roomQuantity: 1,
        guestName,
        guestPhone,
        guestEmail,
        totalPriceToman: 1_250_000n,
        expiresAt: new Date(now.getTime() + 86_400_000),
        confirmedAt: now,
        ...(status === 'CHECKED_IN'
          ? { checkedInAt: now, checkedInByStaffUserId: receptionist.id }
          : {}),
      },
    });
    let assignmentId: string | undefined;
    if (roomIndex !== undefined) {
      const assignment = await f.prisma.roomAssignment.create({
        data: {
          bookingId: booking.id,
          roomId: rooms[roomIndex].id,
          roomTypeId: roomType.id,
          startDate: asDate(checkIn),
          endDate: asDate(checkOut),
          isActive: true,
          assignedByStaffUserId: receptionist.id,
          changeReason: 'Fictional worklist fixture',
        },
      });
      assignmentId = assignment.id;
    }
    const stay = {
      reference,
      status,
      checkIn,
      checkOut,
      guestName,
      guestPhone,
      guestEmail,
      assignmentId,
    };
    stays[key] = stay;
    return stay;
  }

  beforeAll(async () => {
    f = await RoomBoardFixture.start();
    [receptionist, cashier] = await Promise.all([f.staff('RECEPTIONIST'), f.staff('CASHIER')]);
    const property = await f.createProperty(timeZone, new Date('2000-01-01T00:00:00.000Z'));
    roomType = property.type;
    rooms = property.rooms;
    hotelBusinessDate = dateAtTimeZone(timeZone);
    nextDate = addDays(hotelBusinessDate, 1);
    checkoutEdgeDate = addDays(hotelBusinessDate, 2);
    literalSearchDate = addDays(hotelBusinessDate, 4);
    tieBreakDate = addDays(hotelBusinessDate, 6);

    await createStay(
      'overdueArrival',
      'CONFIRMED',
      addDays(hotelBusinessDate, -1),
      nextDate,
      'HPM004 Overdue Arrival Guest',
      0,
    );
    await createStay(
      'todayArrival',
      'CONFIRMED',
      hotelBusinessDate,
      checkoutEdgeDate,
      'HPM004 Arrival Today Guest',
      1,
    );
    await createStay(
      'checkoutExclusive',
      'CONFIRMED',
      addDays(hotelBusinessDate, -1),
      hotelBusinessDate,
      'HPM004 Checkout Edge Guest',
    );
    await createStay(
      'dueOut',
      'CHECKED_IN',
      addDays(hotelBusinessDate, -1),
      hotelBusinessDate,
      'HPM004 Due Out Guest',
      2,
    );
    await createStay(
      'futureArrival',
      'CONFIRMED',
      nextDate,
      addDays(nextDate, 2),
      'HPM004 Tomorrow Arrival Guest',
    );
    await createStay(
      'literalPercent',
      'CONFIRMED',
      literalSearchDate,
      addDays(literalSearchDate, 2),
      'HPM004 Literal % Guest',
    );
    await createStay(
      'literalUnderscore',
      'CONFIRMED',
      literalSearchDate,
      addDays(literalSearchDate, 2),
      'HPM004 Literal _ Guest',
    );
    await createStay(
      'literalBackslash',
      'CONFIRMED',
      literalSearchDate,
      addDays(literalSearchDate, 2),
      'HPM004 Literal \\ Guest',
    );
    await createStay(
      'tieBreakFirst',
      'CONFIRMED',
      tieBreakDate,
      addDays(tieBreakDate, 2),
      'HPM004 Pagination First Guest',
      undefined,
      'HPM004PAGE000001',
    );
    await createStay(
      'tieBreakSecond',
      'CONFIRMED',
      tieBreakDate,
      addDays(tieBreakDate, 2),
      'HPM004 Pagination Second Guest',
      undefined,
      'HPM004PAGE000002',
    );
  }, 30000);

  afterAll(async () => f?.close());

  it.each(worklistRoutes)('registers %s with the expected empty/list response', async (route) => {
    const response = await f.client().get(route).set(receptionist.headers).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const result = bodyOf<StayWorklist>(response.body);
    expect(result.date).toBe(hotelBusinessDate);
    expect(result.businessDate).toBe(hotelBusinessDate);
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.pagination).toMatchObject({ page: 1, pageSize: 20 });
  });

  it('uses the property business date and includes overdue arrivals until exclusive checkout', async () => {
    const response = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    const result = bodyOf<StayWorklist>(response.body);

    expect(result.date).toBe(hotelBusinessDate);
    expect(result.businessDate).toBe(hotelBusinessDate);
    expect(result.items.map(({ reference }) => reference)).toEqual([
      stays.overdueArrival.reference,
      stays.todayArrival.reference,
    ]);
    expect(
      result.items.some(({ reference }) => reference === stays.checkoutExclusive.reference),
    ).toBe(false);
  });

  it('accepts an explicit date and includes arrivals on that date but excludes checkout day', async () => {
    const response = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ date: nextDate })
      .expect(200);
    const result = bodyOf<StayWorklist>(response.body);

    expect(result.date).toBe(nextDate);
    expect(result.businessDate).toBe(hotelBusinessDate);
    expect(result.items.map(({ reference }) => reference)).toEqual([
      stays.todayArrival.reference,
      stays.futureArrival.reference,
    ]);
  });

  it('lists checked-in stays in-house and due-outs through their checkout date', async () => {
    const inHouseResponse = await f
      .client()
      .get(worklistRoutes[1])
      .set(receptionist.headers)
      .expect(200);
    const departuresResponse = await f
      .client()
      .get(worklistRoutes[2])
      .set(receptionist.headers)
      .expect(200);
    const inHouse = bodyOf<StayWorklist>(inHouseResponse.body);
    const departures = bodyOf<StayWorklist>(departuresResponse.body);

    expect(inHouse.items.map(({ reference }) => reference)).toEqual([stays.dueOut.reference]);
    expect(departures.items.map(({ reference }) => reference)).toEqual([stays.dueOut.reference]);
    expect(departures.items[0]).toMatchObject({
      status: 'CHECKED_IN',
      assignedRooms: [
        {
          assignmentId: stays.dueOut.assignmentId,
          roomNumber: '201',
          housekeepingStatus: 'DIRTY',
          endDate: hotelBusinessDate,
        },
      ],
    });
    expect(typeof departures.items[0]?.checkedInAt).toBe('string');
  });

  it('searches only guest name, reference, and active assigned room number', async () => {
    const byName = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ search: 'overdue arrival' })
      .expect(200);
    const byReference = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ search: stays.todayArrival.reference.toLowerCase() })
      .expect(200);
    const byRoom = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ search: '101' })
      .expect(200);
    const byPhone = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ search: stays.overdueArrival.guestPhone })
      .expect(200);
    const byEmail = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ search: stays.overdueArrival.guestEmail })
      .expect(200);

    expect(bodyOf<StayWorklist>(byName.body).items.map(({ reference }) => reference)).toEqual([
      stays.overdueArrival.reference,
    ]);
    expect(bodyOf<StayWorklist>(byReference.body).items.map(({ reference }) => reference)).toEqual([
      stays.todayArrival.reference,
    ]);
    expect(bodyOf<StayWorklist>(byRoom.body).items.map(({ reference }) => reference)).toEqual([
      stays.overdueArrival.reference,
    ]);
    expect(bodyOf<StayWorklist>(byPhone.body).items).toEqual([]);
    expect(bodyOf<StayWorklist>(byEmail.body).items).toEqual([]);
  });

  it.each([
    ['%', 'literalPercent'],
    ['_', 'literalUnderscore'],
    ['\\', 'literalBackslash'],
  ])('search treats %s as a literal character', async (search, stayKey) => {
    const response = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ date: literalSearchDate, search })
      .expect(200);

    expect(bodyOf<StayWorklist>(response.body).items.map(({ reference }) => reference)).toEqual([
      stays[stayKey].reference,
    ]);
  });

  it('orders same-date arrivals by reference across paginated pages', async () => {
    const first = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ date: tieBreakDate, page: 1, pageSize: 1 })
      .expect(200);
    const second = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ date: tieBreakDate, page: 2, pageSize: 1 })
      .expect(200);

    expect(bodyOf<StayWorklist>(first.body).items.map(({ reference }) => reference)).toEqual([
      stays.tieBreakFirst.reference,
    ]);
    expect(bodyOf<StayWorklist>(second.body).items.map(({ reference }) => reference)).toEqual([
      stays.tieBreakSecond.reference,
    ]);
  });

  it('paginates arrivals by date then reference and omits contact and billing data', async () => {
    const first = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ page: 1, pageSize: 1 })
      .expect(200);
    const second = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ page: 2, pageSize: 1 })
      .expect(200);
    const result = bodyOf<StayWorklist>(first.body);

    expect(result.pagination).toEqual({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
    expect(result.items.map(({ reference }) => reference)).toEqual([
      stays.overdueArrival.reference,
    ]);
    expect(bodyOf<StayWorklist>(second.body).items.map(({ reference }) => reference)).toEqual([
      stays.todayArrival.reference,
    ]);
    expect(first.text).not.toMatch(/guestPhone|guestEmail|1250000|totalPriceToman/);
    expect(result.items[0].assignedRooms).toEqual([
      {
        assignmentId: stays.overdueArrival.assignmentId,
        roomNumber: '101',
        housekeepingStatus: 'INSPECTED',
        startDate: addDays(hotelBusinessDate, -1),
        endDate: nextDate,
      },
    ]);
  });

  it('protects stay amendments and room moves with session, capability, and CSRF checks', async () => {
    const reference = stays.todayArrival.reference;
    const requests = [
      () => f.client().patch(bookingRoute(reference)).send({ guestName: 'Private Guest Updated' }),
      () =>
        f
          .client()
          .post(bookingRoute(reference) + '/room-move')
          .send({
            sourceAssignmentId: stays.todayArrival.assignmentId,
            targetRoomId: rooms[1].id,
            reason: 'Operational move',
          }),
    ];
    for (const send of requests) {
      await send().expect(401).expect('Cache-Control', 'private, no-store');
      await send().set(cashier.headers).expect(403).expect('Cache-Control', 'private, no-store');
      await send()
        .set({ Cookie: receptionist.headers.Cookie })
        .expect(403)
        .expect('Cache-Control', 'private, no-store');
    }
  });

  it('rejects other booking fields and minimizes both mutation responses', async () => {
    const confirmed = await createStay(
      'amendMutation',
      'CONFIRMED',
      hotelBusinessDate,
      nextDate,
      'Private Amendment Guest',
    );
    const amendmentRoute = bookingRoute(confirmed.reference);
    for (const extra of [
      { roomTypeSlug: 'other' },
      { roomTypeId: roomType.id },
      { status: 'CHECKED_IN' },
      { guestName: null },
      { roomQuantity: true },
      { guestCount: '3' },
    ]) {
      await f.client().patch(amendmentRoute).set(receptionist.headers).send(extra).expect(400);
    }
    await f
      .client()
      .patch(amendmentRoute)
      .set(receptionist.headers)
      .send({ guestPhone: 'invalid-phone-value' })
      .expect(400)
      .expect((response) => expect(response.text).not.toContain('invalid-phone-value'));
    const amendment = await f
      .client()
      .patch(amendmentRoute)
      .set(receptionist.headers)
      .send({ guestName: 'Private Guest Updated', guestPhone: '0912 123 4567' })
      .expect(200);
    const updated = await f.prisma.booking.findUniqueOrThrow({
      where: { publicReference: confirmed.reference },
    });
    expect(updated).toMatchObject({
      guestName: 'Private Guest Updated',
      guestPhone: '+989121234567',
    });

    const checkedIn = await createStay(
      'moveMutation',
      'CHECKED_IN',
      hotelBusinessDate,
      nextDate,
      'Private Move Guest',
      2,
    );
    const target = await f.prisma.room.create({
      data: {
        hotelId: rooms[2].hotelId,
        roomTypeId: roomType.id,
        roomNumber: '301',
        housekeepingStatus: 'INSPECTED',
      },
    });
    const inHouseStay = () =>
      f
        .client()
        .get(worklistRoutes[1])
        .set(receptionist.headers)
        .query({ search: checkedIn.reference })
        .expect(200);
    const before = bodyOf<StayWorklist>((await inHouseStay()).body);
    const sourceAssignmentId = before.items[0].assignedRooms[0].assignmentId;
    expect(sourceAssignmentId).toBe(checkedIn.assignmentId);

    const moveRoute = bookingRoute(checkedIn.reference) + '/room-move';
    const move = () => f.client().post(moveRoute).set(receptionist.headers);
    await move()
      .send({
        sourceRoomId: rooms[2].id,
        targetRoomId: target.id,
        reason: 'Private operational reason',
      })
      .expect(400);
    const moved = await move()
      .send({
        sourceAssignmentId,
        targetRoomId: target.id,
        reason: 'Private operational reason',
      })
      .expect(200);

    const after = bodyOf<StayWorklist>((await inHouseStay()).body);
    const targetAssignment = await f.prisma.roomAssignment.findFirstOrThrow({
      where: {
        booking: { publicReference: checkedIn.reference },
        roomId: target.id,
        isActive: true,
      },
    });
    expect(after.items[0].assignedRooms).toMatchObject([
      { assignmentId: targetAssignment.id, roomNumber: '301' },
    ]);
    expect(targetAssignment.id).not.toBe(sourceAssignmentId);

    for (const response of [amendment, moved]) {
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(Object.keys(response.body as object).sort()).toEqual([
        'checkIn',
        'checkOut',
        'checkedInAt',
        'confirmedAt',
        'noShowAt',
        'reference',
        'status',
      ]);
      expect(response.text).not.toMatch(
        /Private|guestPhone|guestEmail|totalPriceToman|assignmentId/,
      );
    }
  });

  it('rejects invalid dates and pagination and enforces receptionist capability', async () => {
    const invalidDate = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ date: '2026-02-31' })
      .expect(400);
    const invalidPage = await f
      .client()
      .get(worklistRoutes[0])
      .set(receptionist.headers)
      .query({ page: 0 })
      .expect(400);

    expect(bodyOf<{ code?: string }>(invalidDate.body).code).toBe('INVALID_DATE_RANGE');
    expect(bodyOf<{ code?: string }>(invalidPage.body).code).toBe('VALIDATION_ERROR');
    for (const route of worklistRoutes) {
      await f.client().get(route).expect(401).expect('Cache-Control', 'private, no-store');
      await f.client().get(route).set(cashier.headers).expect(403);
    }
  });
});
