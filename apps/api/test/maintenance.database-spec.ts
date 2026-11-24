import { randomUUID } from 'node:crypto';
import { addDays, parseDateOnly } from '../src/availability/date-range';
import { RoomBoardFixture } from './room-board-fixture';

describe('PostgreSQL maintenance blocks', () => {
  const runTag = 'E2E-HPM006-' + randomUUID();
  let fixture: RoomBoardFixture | undefined;
  let property: Awaited<ReturnType<RoomBoardFixture['createProperty']>>;
  let manager: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let receptionist: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let housekeeper: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let cashier: Awaited<ReturnType<RoomBoardFixture['staff']>>;

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
    property = await fixture.createProperty();
    manager = await fixture.staff('MANAGER');
    receptionist = await fixture.staff('RECEPTIONIST');
    housekeeper = await fixture.staff('HOUSEKEEPER');
    cashier = await fixture.staff('CASHIER');
  });

  afterAll(async () => {
    await fixture?.close({ preserveData: true });
  });

  async function createProperty() {
    return fixture!.createProperty('Asia/Tehran', undefined, randomUUID());
  }

  async function createInventory(
    roomTypeId: string,
    dates: string[],
    options: { totalRooms?: number; heldRooms?: number; bookedRooms?: number } = {},
  ) {
    await fixture!.prisma.roomNightInventory.createMany({
      data: dates.map((stayDate) => ({
        roomTypeId,
        stayDate: parseDateOnly(stayDate),
        totalRooms: options.totalRooms ?? 3,
        heldRooms: options.heldRooms ?? 0,
        bookedRooms: options.bookedRooms ?? 0,
        nightlyPriceToman: 1500n,
      })),
    });
  }

  function createBlock(
    roomId: string,
    startDate: string,
    endDate: string,
    headers = manager.headers,
    kind: 'OUT_OF_ORDER' | 'CAPACITY_CLOSED' = 'OUT_OF_ORDER',
  ) {
    return fixture!
      .client()
      .post('/api/v1/staff/maintenance/blocks')
      .set(headers)
      .send({ roomId, startDate, endDate, kind, reason: `${runTag} maintenance work` });
  }

  it('projects a block onto its start and covered nights but not its exclusive end date', async () => {
    const dates = [
      addDays(fixture!.checkIn, -1),
      fixture!.checkIn,
      fixture!.next,
      fixture!.checkOut,
    ];
    await createInventory(property.type.id, dates);

    await createBlock(property.rooms[0].id, fixture!.checkIn, fixture!.checkOut).expect(201);

    const nights = await fixture!.prisma.roomNightInventory.findMany({
      where: { roomTypeId: property.type.id },
      orderBy: { stayDate: 'asc' },
      select: { stayDate: true, totalRooms: true, blockedRooms: true },
    });
    expect(nights).toEqual([
      { stayDate: parseDateOnly(dates[0]), totalRooms: 3, blockedRooms: 0 },
      { stayDate: parseDateOnly(dates[1]), totalRooms: 2, blockedRooms: 1 },
      { stayDate: parseDateOnly(dates[2]), totalRooms: 2, blockedRooms: 1 },
      { stayDate: parseDateOnly(dates[3]), totalRooms: 3, blockedRooms: 0 },
    ]);
  });

  it('rejects overlapping blocks for one room but allows adjacent end-exclusive periods', async () => {
    const isolated = await createProperty();
    const end = addDays(fixture!.checkIn, 3);
    await createInventory(isolated.type.id, [
      fixture!.checkIn,
      fixture!.next,
      fixture!.checkOut,
      end,
    ]);

    await createBlock(isolated.rooms[0].id, fixture!.checkIn, fixture!.checkOut).expect(201);
    await createBlock(isolated.rooms[0].id, fixture!.next, end).expect(409);
    await createBlock(isolated.rooms[0].id, fixture!.checkOut, end).expect(201);

    expect(
      await fixture!.prisma.roomBlock.count({
        where: { roomId: isolated.rooms[0].id, isActive: true },
      }),
    ).toBe(2);
  });

  it.each([
    ['a confirmed assigned room', 'CONFIRMED'],
    ['an occupied checked-in room', 'CHECKED_IN'],
  ])('denies an out-of-order block overlapping %s', async (_label, status) => {
    const isolated = await createProperty();
    const booking = await fixture!.booking(isolated.type.id, 1, fixture!.checkIn);
    await fixture!.prisma.booking.update({
      where: { id: booking.id },
      data: { status: status as 'CONFIRMED' | 'CHECKED_IN' },
    });
    await fixture!.prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomId: isolated.rooms[0].id,
        roomTypeId: isolated.type.id,
        startDate: parseDateOnly(fixture!.checkIn),
        endDate: parseDateOnly(fixture!.checkOut),
      },
    });

    await createBlock(isolated.rooms[0].id, fixture!.checkIn, fixture!.checkOut).expect(409);
    expect(await fixture!.prisma.roomBlock.count({ where: { roomId: isolated.rooms[0].id } })).toBe(
      0,
    );
  });

  it('rolls back a block when projected capacity would fall below held or booked rooms', async () => {
    const isolated = await createProperty();
    await createInventory(isolated.type.id, [fixture!.checkIn], {
      totalRooms: 3,
      bookedRooms: 3,
    });

    await createBlock(isolated.rooms[0].id, fixture!.checkIn, fixture!.next).expect(409);

    expect(await fixture!.prisma.roomBlock.count({ where: { roomId: isolated.rooms[0].id } })).toBe(
      0,
    );
    await expect(
      fixture!.prisma.roomNightInventory.findFirstOrThrow({
        where: { roomTypeId: isolated.type.id },
        select: { totalRooms: true, blockedRooms: true, bookedRooms: true },
      }),
    ).resolves.toEqual({ totalRooms: 3, blockedRooms: 0, bookedRooms: 3 });
  });

  it('serializes a final-room booking race so either the booking or block wins', async () => {
    const isolated = await createProperty();
    await fixture!.prisma.room.updateMany({
      where: { id: { in: isolated.rooms.slice(1).map(({ id }) => id) } },
      data: { isActive: false },
    });
    await createInventory(isolated.type.id, [fixture!.checkIn, fixture!.next], {
      totalRooms: 1,
    });

    const blockRequest = createBlock(
      isolated.rooms[0].id,
      fixture!.checkIn,
      fixture!.checkOut,
      manager.headers,
      'CAPACITY_CLOSED',
    );
    const bookingRequest = fixture!
      .client()
      .post('/api/v1/bookings')
      .set('Idempotency-Key', `hpm006-${randomUUID()}`)
      .send({
        roomTypeSlug: isolated.type.slug,
        checkIn: fixture!.checkIn,
        checkOut: fixture!.checkOut,
        guestCount: 1,
        roomQuantity: 1,
        guestName: 'Fictional HPM guest',
        guestPhone: '+989121234567',
        guestEmail: 'hpm006@example.invalid',
      });
    const [blockResponse, bookingResponse] = await Promise.all([blockRequest, bookingRequest]);

    expect([blockResponse.status, bookingResponse.status].sort()).toEqual([201, 409]);
    const nights = await fixture!.prisma.roomNightInventory.findMany({
      where: { roomTypeId: isolated.type.id },
      orderBy: { stayDate: 'asc' },
      select: { totalRooms: true, blockedRooms: true, heldRooms: true, bookedRooms: true },
    });
    if (blockResponse.status === 201) {
      expect(nights).toEqual([
        { totalRooms: 0, blockedRooms: 1, heldRooms: 0, bookedRooms: 0 },
        { totalRooms: 0, blockedRooms: 1, heldRooms: 0, bookedRooms: 0 },
      ]);
    } else {
      expect(nights).toEqual([
        { totalRooms: 1, blockedRooms: 0, heldRooms: 1, bookedRooms: 0 },
        { totalRooms: 1, blockedRooms: 0, heldRooms: 1, bookedRooms: 0 },
      ]);
    }
  });

  it('restores capacity once even when the same block is restored repeatedly', async () => {
    const isolated = await createProperty();
    await createInventory(isolated.type.id, [fixture!.checkIn, fixture!.next]);
    const block = await createBlock(isolated.rooms[0].id, fixture!.checkIn, fixture!.next).expect(
      201,
    );
    const blockBody = block.body as { id: string };
    const blockId = blockBody.id;

    await fixture!
      .client()
      .post(`/api/v1/staff/maintenance/blocks/${blockId}/restore`)
      .set(manager.headers)
      .send({ reason: `${runTag} equipment returned to service` })
      .expect(200);
    await fixture!
      .client()
      .post(`/api/v1/staff/maintenance/blocks/${blockId}/restore`)
      .set(manager.headers)
      .send({ reason: `${runTag} repeated restoration` })
      .expect(200);

    await expect(
      fixture!.prisma.roomBlock.findUniqueOrThrow({ where: { id: blockId } }),
    ).resolves.toMatchObject({ isActive: false });
    expect(
      await fixture!.prisma.roomNightInventory.findMany({
        where: { roomTypeId: isolated.type.id },
        orderBy: { stayDate: 'asc' },
        select: { totalRooms: true, blockedRooms: true },
      }),
    ).toEqual([
      { totalRooms: 3, blockedRooms: 0 },
      { totalRooms: 3, blockedRooms: 0 },
    ]);
    expect(
      await fixture!.prisma.auditEvent.count({
        where: { eventName: 'ROOM_BLOCK_RESTORED', targetId: blockId },
      }),
    ).toBe(1);
  });

  it('does not restore capacity-preservation blocks created by the physical-room migration', async () => {
    const isolated = await createProperty();
    await createInventory(isolated.type.id, [fixture!.checkIn], { totalRooms: 2 });
    const block = await fixture!.prisma.roomBlock.create({
      data: {
        roomId: isolated.rooms[0].id,
        startDate: parseDateOnly(fixture!.checkIn),
        endDate: parseDateOnly(fixture!.next),
        kind: 'CAPACITY_CLOSED',
        reason: 'Preserve legacy room-type nightly capacity during physical-room migration.',
      },
    });
    await fixture!.prisma.roomNightInventory.updateMany({
      where: { roomTypeId: isolated.type.id, stayDate: parseDateOnly(fixture!.checkIn) },
      data: { blockedRooms: 1 },
    });

    const response = await fixture!
      .client()
      .post(`/api/v1/staff/maintenance/blocks/${block.id}/restore`)
      .set(manager.headers)
      .send({ reason: `${runTag} legacy capacity must remain preserved` });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'LEGACY_CAPACITY_BLOCK_IMMUTABLE' });
    await expect(
      fixture!.prisma.roomBlock.findUniqueOrThrow({ where: { id: block.id } }),
    ).resolves.toMatchObject({ isActive: true });
    await expect(
      fixture!.prisma.roomNightInventory.findFirstOrThrow({
        where: { roomTypeId: isolated.type.id, stayDate: parseDateOnly(fixture!.checkIn) },
        select: { totalRooms: true, blockedRooms: true },
      }),
    ).resolves.toEqual({ totalRooms: 2, blockedRooms: 1 });
  });

  it('stores an optional expected return date separately from the block end date', async () => {
    const isolated = await createProperty();
    await createInventory(isolated.type.id, [fixture!.checkIn, fixture!.next, fixture!.checkOut]);

    const withForecast = await fixture!
      .client()
      .post('/api/v1/staff/maintenance/blocks')
      .set(manager.headers)
      .send({
        roomId: isolated.rooms[0].id,
        startDate: fixture!.checkIn,
        endDate: fixture!.checkOut,
        expectedReturnDate: fixture!.next,
        kind: 'OUT_OF_ORDER',
        reason: `${runTag} forecasted repair return`,
      })
      .expect(201);

    expect(withForecast.body).toMatchObject({
      startDate: fixture!.checkIn,
      endDate: fixture!.checkOut,
      expectedReturnDate: fixture!.next,
    });

    const withoutForecast = await fixture!
      .client()
      .post('/api/v1/staff/maintenance/blocks')
      .set(manager.headers)
      .send({
        roomId: isolated.rooms[1].id,
        startDate: fixture!.checkIn,
        endDate: fixture!.checkOut,
        kind: 'OUT_OF_ORDER',
        reason: `${runTag} repair has no forecast`,
      })
      .expect(201);

    expect(withoutForecast.body).toMatchObject({
      endDate: fixture!.checkOut,
      expectedReturnDate: null,
    });

    const invalidForecast = await fixture!
      .client()
      .post('/api/v1/staff/maintenance/blocks')
      .set(manager.headers)
      .send({
        roomId: isolated.rooms[2].id,
        startDate: fixture!.checkIn,
        endDate: fixture!.checkOut,
        expectedReturnDate: addDays(fixture!.checkOut, 1),
        kind: 'OUT_OF_ORDER',
        reason: `${runTag} forecast outside block interval`,
      })
      .expect(400);

    expect(invalidForecast.body).toMatchObject({ code: 'INVALID_EXPECTED_RETURN_DATE' });
    expect(await fixture!.prisma.roomBlock.count({ where: { roomId: isolated.rooms[2].id } })).toBe(
      0,
    );
  });

  it('keeps maintenance requests independent from blocks and lets reception submit repair work', async () => {
    const isolated = await createProperty();
    const createResponse = await fixture!
      .client()
      .post('/api/v1/staff/maintenance/requests')
      .set(receptionist.headers)
      .send({
        roomId: isolated.rooms[0].id,
        category: 'PLUMBING',
        description: `${runTag} sink tap is leaking`,
        priority: 'HIGH',
        expectedDate: fixture!.checkIn,
      })
      .expect(201);
    const createdRequest = createResponse.body as {
      id: string;
      category: string;
      priority: string;
      status: string;
      expectedDate: string;
      openedAt: string;
      resolvedAt: string | null;
    };
    const requestId = createdRequest.id;

    expect(createdRequest).toMatchObject({
      category: 'PLUMBING',
      priority: 'HIGH',
      status: 'OPEN',
      expectedDate: fixture!.checkIn,
    });
    expect(createdRequest.openedAt).toEqual(expect.any(String));
    expect(createdRequest.resolvedAt).toBeNull();
    expect(await fixture!.prisma.roomBlock.count({ where: { roomId: isolated.rooms[0].id } })).toBe(
      0,
    );

    const list = await fixture!
      .client()
      .get('/api/v1/staff/maintenance/requests')
      .set(manager.headers)
      .query({ roomId: isolated.rooms[0].id, status: 'OPEN' })
      .expect(200);
    expect(list.headers['cache-control']).toContain('private');
    expect(list.headers['cache-control']).toContain('no-store');
    const listBody = list.body as { items: Array<{ id: string; status: string }> };
    expect(listBody.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: requestId, status: 'OPEN' })]),
    );

    const assignees = await fixture!
      .client()
      .get('/api/v1/staff/maintenance/assignees')
      .set(manager.headers)
      .expect(200);
    const assigneeBody = assignees.body as { items: Array<{ id: string; username: string }> };
    expect(assigneeBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: housekeeper.id, username: housekeeper.id }),
      ]),
    );
    expect(assigneeBody.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: cashier.id })]),
    );
    const rooms = await fixture!
      .client()
      .get('/api/v1/staff/maintenance/rooms')
      .set(housekeeper.headers)
      .expect(200);
    const roomBody = rooms.body as { items: Array<{ id: string; roomNumber: string }> };
    expect(roomBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: isolated.rooms[0].id,
          roomNumber: isolated.rooms[0].roomNumber,
        }),
      ]),
    );

    await fixture!
      .client()
      .patch(`/api/v1/staff/maintenance/requests/${requestId}/assignment`)
      .set(manager.headers)
      .send({ assigneeStaffUserId: housekeeper.id })
      .expect(200);
    const resolved = await fixture!
      .client()
      .post(`/api/v1/staff/maintenance/requests/${requestId}/resolve`)
      .set(manager.headers)
      .send({ resolutionNote: `${runTag} tap washer replaced` })
      .expect(200);
    const resolvedBody = resolved.body as {
      id: string;
      status: string;
      resolutionNote: string;
      resolvedAt: string;
    };
    expect(resolvedBody).toMatchObject({
      id: requestId,
      status: 'RESOLVED',
      resolutionNote: `${runTag} tap washer replaced`,
    });
    expect(resolvedBody.resolvedAt).toEqual(expect.any(String));
  });

  it('restricts block controls and maintenance reads by staff capability', async () => {
    const isolated = await createProperty();
    const unauthorizedBlock = await createBlock(
      isolated.rooms[0].id,
      fixture!.checkIn,
      fixture!.next,
      receptionist.headers,
    );
    expect(unauthorizedBlock.status).toBe(403);

    await fixture!
      .client()
      .get('/api/v1/staff/maintenance/requests')
      .set(cashier.headers)
      .expect(403);
    await fixture!
      .client()
      .get('/api/v1/staff/maintenance/assignees')
      .set(cashier.headers)
      .expect(403);
  });
});
