import { randomUUID } from 'node:crypto';
import { addDays, parseDateOnly } from '../src/availability/date-range';
import { AuditService } from '../src/audit/audit.service';
import { FoliosService } from '../src/folios/folios.service';
import { RoomBoardFixture } from './room-board-fixture';

const api = '/api/v1/staff';

type FolioEntryBody = {
  id: string;
  kind: string;
  direction: string;
  amountToman: string;
  paymentMethod: string | null;
  paymentReference: string | null;
};

type FolioBody = {
  id: string;
  status: string;
  balanceToman: string;
  entries: FolioEntryBody[];
};

function bodyAs<T>(response: { body: unknown }): T {
  return response.body as T;
}

describe('PostgreSQL folio settlement and checkout', () => {
  const runTag = `HPM008-${randomUUID()}`;
  let fixture: RoomBoardFixture | undefined;
  let property: Awaited<ReturnType<RoomBoardFixture['createProperty']>>;
  let manager: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let receptionist: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let cashier: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let housekeeper: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let serviceItemId: string;
  let roomSequence = 0;

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
    property = await fixture.createProperty('Asia/Tehran', undefined, randomUUID());
    manager = await fixture.staff('MANAGER');
    receptionist = await fixture.staff('RECEPTIONIST');
    cashier = await fixture.staff('CASHIER');
    housekeeper = await fixture.staff('HOUSEKEEPER');
    const service = await fixture
      .client()
      .post(`${api}/services`)
      .set(manager.headers)
      .send({ name: `${runTag} Breakfast`, category: 'Food', currentPriceToman: '10000' })
      .expect(201);
    serviceItemId = bodyAs<{ id: string }>(service).id;
  });

  afterAll(async () => {
    await fixture?.close({ preserveData: true });
  });

  async function createInHouseStay() {
    const checkIn = addDays(fixture!.today, -1);
    const booking = await fixture!.booking(property.type.id, 1, checkIn);
    const room = await fixture!.prisma.room.create({
      data: {
        hotelId: property.hotel.id,
        roomTypeId: property.type.id,
        roomNumber: `H8-${String(++roomSequence).padStart(3, '0')}`,
        housekeepingStatus: 'INSPECTED',
      },
    });
    const assignment = await fixture!.prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomId: room.id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(checkIn),
        endDate: booking.checkOut,
      },
    });
    await fixture!.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CHECKED_IN', checkedInAt: new Date() },
    });
    for (const stayDate of [checkIn, fixture!.today]) {
      await fixture!.prisma.roomNightInventory.upsert({
        where: {
          roomTypeId_stayDate: { roomTypeId: property.type.id, stayDate: parseDateOnly(stayDate) },
        },
        create: {
          roomTypeId: property.type.id,
          stayDate: parseDateOnly(stayDate),
          totalRooms: 100,
          bookedRooms: 1,
          nightlyPriceToman: 1500n,
        },
        update: { bookedRooms: { increment: 1 } },
      });
    }
    return { booking, assignmentId: assignment.id, roomId: room.id, checkIn };
  }

  function postService(bookingId: string, key = `${runTag}-charge-${randomUUID()}`) {
    return fixture!
      .client()
      .post(`${api}/folios/${bookingId}/services`)
      .set({ ...cashier.headers, 'Idempotency-Key': key })
      .send({ serviceItemId: serviceItemId, quantity: 1, serviceDate: fixture!.today });
  }

  function checkout(
    bookingId: string,
    headers = manager.headers,
    key = `${runTag}-checkout-${randomUUID()}`,
    body: Record<string, unknown> = {},
  ) {
    return fixture!
      .client()
      .post(`${api}/folios/${bookingId}/checkout`)
      .set({ ...headers, 'Idempotency-Key': key })
      .send(body);
  }

  it('records positive manual settlements for each supported method without card data', async () => {
    for (const method of ['CASH', 'BANK_TERMINAL', 'BANK_TRANSFER', 'OTHER']) {
      const { booking } = await createInHouseStay();
      await postService(booking.id).expect(200);
      const response = await fixture!
        .client()
        .post(`${api}/folios/${booking.id}/payments`)
        .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-pay-${method}` })
        .send({ amountToman: '5000', method, reference: `RCPT-${method}` })
        .expect(200);

      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(bodyAs<FolioBody>(response).entries).toContainEqual(
        expect.objectContaining({
          kind: 'PAYMENT',
          direction: 'CREDIT',
          amountToman: '5000',
          paymentMethod: method,
          paymentReference: `RCPT-${method}`,
        }),
      );
    }
  });

  it('rejects zero, over-balance and cardholder-data payment requests', async () => {
    const { booking } = await createInHouseStay();
    await postService(booking.id).expect(200);
    const payment = () =>
      fixture!
        .client()
        .post(`${api}/folios/${booking.id}/payments`)
        .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-bad-pay-${randomUUID()}` });

    await payment().send({ amountToman: '0', method: 'CASH' }).expect(400);
    await payment().send({ amountToman: '10001', method: 'CASH' }).expect(409);
    await payment()
      .send({ amountToman: '1000', method: 'CASH', cardNumber: '4111111111111111' })
      .expect(400);
    await payment()
      .send({ amountToman: '1000', method: 'CASH', reference: '4111111111111111' })
      .expect(400);
    await payment()
      .send({ amountToman: '1000', method: 'CASH', reference: '۴۱۱۱۱۱۱۱۱۱۱۱۱۱۱۱' })
      .expect(400);
    await payment()
      .send({ amountToman: '1000', method: 'CASH', reference: '٤١١١١١١١١١١١١١١١' })
      .expect(400);
  });

  it('deduplicates payment retries and limits a reasoned refund to its unrefunded source', async () => {
    const { booking } = await createInHouseStay();
    await postService(booking.id).expect(200);
    const pay = () =>
      fixture!
        .client()
        .post(`${api}/folios/${booking.id}/payments`)
        .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-same-payment` })
        .send({ amountToman: '5000', method: 'BANK_TRANSFER', reference: 'TRANSFER-2026-08' });
    const first = await pay().expect(200);
    await pay().expect(200);
    const firstBody = bodyAs<FolioBody>(first);
    const paymentEntry = firstBody.entries.find((entry) => entry.kind === 'PAYMENT');
    if (!paymentEntry) throw new Error('The source payment entry was not returned.');
    expect(
      await fixture!.prisma.folioEntry.count({
        where: {
          folioId: firstBody.id,
          kind: 'PAYMENT',
          idempotencyKey: `payment:${booking.id}:${runTag}-same-payment`,
        },
      }),
    ).toBe(1);

    const refund = () =>
      fixture!
        .client()
        .post(`${api}/folios/${booking.id}/refunds`)
        .set({ ...manager.headers, 'Idempotency-Key': `${runTag}-refund-001` })
        .send({
          paymentEntryId: paymentEntry.id,
          amountToman: '3000',
          reason: 'Guest refund test',
        });
    const refunded = await refund().expect(200);
    expect(bodyAs<FolioBody>(refunded).entries).toContainEqual(
      expect.objectContaining({ kind: 'REFUND', direction: 'DEBIT', amountToman: '3000' }),
    );
    await refund().expect(200);

    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/refunds`)
      .set({ ...manager.headers, 'Idempotency-Key': `${runTag}-refund-too-much` })
      .send({ paymentEntryId: paymentEntry.id, amountToman: '2001', reason: 'Over refund test' })
      .expect(409);
    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/refunds`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-refund-denied` })
      .send({ paymentEntryId: paymentEntry.id, amountToman: '100', reason: 'Unauthorized test' })
      .expect(403);
  });

  it('denies ordinary checkout with a balance and rolls back final room-night charges', async () => {
    const { booking } = await createInHouseStay();
    await postService(booking.id).expect(200);
    const response = await checkout(booking.id, cashier.headers).expect(409);
    expect(bodyAs<{ code: string }>(response)).toMatchObject({ code: 'FOLIO_BALANCE_NOT_SETTLED' });
    expect(
      await fixture!.prisma.folioEntry.count({
        where: { folio: { bookingId: booking.id }, source: 'ROOM_NIGHT' },
      }),
    ).toBe(0);
    expect(
      await fixture!.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).toMatchObject({
      status: 'CHECKED_IN',
    });
  });

  it('checks out on the same business date as check-in without violating the stay date range', async () => {
    const checkIn = fixture!.today;
    const booking = await fixture!.booking(property.type.id, 1, checkIn);
    const room = await fixture!.prisma.room.create({
      data: {
        hotelId: property.hotel.id,
        roomTypeId: property.type.id,
        roomNumber: `H8-SD-${String(++roomSequence).padStart(3, '0')}`,
        housekeepingStatus: 'INSPECTED',
      },
    });
    await fixture!.prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomId: room.id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(checkIn),
        endDate: booking.checkOut,
      },
    });
    await fixture!.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CHECKED_IN', checkedInAt: new Date() },
    });
    for (const stayDate of [checkIn, addDays(checkIn, 1)]) {
      await fixture!.prisma.roomNightInventory.upsert({
        where: {
          roomTypeId_stayDate: { roomTypeId: property.type.id, stayDate: parseDateOnly(stayDate) },
        },
        create: {
          roomTypeId: property.type.id,
          stayDate: parseDateOnly(stayDate),
          totalRooms: 100,
          bookedRooms: 1,
          nightlyPriceToman: 1500n,
        },
        update: { bookedRooms: { increment: 1 } },
      });
    }

    const response = await checkout(booking.id, manager.headers).expect(200);
    const completedBooking = await fixture!.prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true, checkIn: true, checkOut: true, actualDepartureDate: true },
    });
    expect(completedBooking).toMatchObject({
      status: 'CHECKED_OUT',
      checkIn: parseDateOnly(checkIn),
      checkOut: booking.checkOut,
      actualDepartureDate: parseDateOnly(checkIn),
    });
    expect(
      bodyAs<FolioBody & { booking: { actualDepartureDate: string | null } }>(response).booking,
    ).toMatchObject({ actualDepartureDate: checkIn });
  });

  it('extends an overdue in-house stay safely, then charges all nights across a room move', async () => {
    const checkIn = addDays(fixture!.today, -3);
    const booking = await fixture!.booking(property.type.id, 1, checkIn);
    const movedAt = addDays(checkIn, 1);
    const originalRoom = await fixture!.prisma.room.create({
      data: {
        hotelId: property.hotel.id,
        roomTypeId: property.type.id,
        roomNumber: `H8-OV-${String(++roomSequence).padStart(3, '0')}`,
        housekeepingStatus: 'INSPECTED',
      },
    });
    const currentRoom = await fixture!.prisma.room.create({
      data: {
        hotelId: property.hotel.id,
        roomTypeId: property.type.id,
        roomNumber: `H8-OV-${String(++roomSequence).padStart(3, '0')}`,
        housekeepingStatus: 'INSPECTED',
      },
    });
    const historicalAssignment = await fixture!.prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomId: originalRoom.id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(checkIn),
        endDate: parseDateOnly(movedAt),
        isActive: false,
      },
    });
    const assignment = await fixture!.prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomId: currentRoom.id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(movedAt),
        endDate: booking.checkOut,
      },
    });
    await fixture!.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CHECKED_IN', checkedInAt: new Date() },
    });
    for (const stayDate of [checkIn, movedAt, booking.checkOut.toISOString().slice(0, 10)]) {
      const isExtensionNight = stayDate === booking.checkOut.toISOString().slice(0, 10);
      await fixture!.prisma.roomNightInventory.upsert({
        where: {
          roomTypeId_stayDate: { roomTypeId: property.type.id, stayDate: parseDateOnly(stayDate) },
        },
        create: {
          roomTypeId: property.type.id,
          stayDate: parseDateOnly(stayDate),
          totalRooms: 100,
          bookedRooms: isExtensionNight ? 0 : 1,
          nightlyPriceToman: isExtensionNight ? 2000n : 1500n,
        },
        update: {
          bookedRooms: isExtensionNight ? 0 : 1,
          nightlyPriceToman: isExtensionNight ? 2000n : 1500n,
        },
      });
    }

    const response = await checkout(booking.id, manager.headers, `${runTag}-overdue-checkout`, {
      onAccountReason: 'Fictional overdue stay test',
    }).expect(409);
    expect(bodyAs<{ code: string }>(response)).toMatchObject({ code: 'STAY_EXTENSION_REQUIRED' });
    expect(
      await fixture!.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).toMatchObject({
      status: 'CHECKED_IN',
      checkOut: booking.checkOut,
      actualDepartureDate: null,
    });
    expect(
      await fixture!.prisma.folio.findUniqueOrThrow({ where: { bookingId: booking.id } }),
    ).toMatchObject({ status: 'OPEN', checkoutIdempotencyKey: null });
    expect(
      await fixture!.prisma.folioEntry.count({ where: { folio: { bookingId: booking.id } } }),
    ).toBe(0);
    expect(
      await fixture!.prisma.roomAssignment.findUniqueOrThrow({ where: { id: assignment.id } }),
    ).toMatchObject({ isActive: true });
    await fixture!
      .client()
      .post(`${api}/bookings/${booking.publicReference}/extend`)
      .set(receptionist.headers)
      .send({ checkOut: fixture!.today, reason: 'Fictional overdue extension' })
      .expect(403);

    const extended = await fixture!
      .client()
      .post(`${api}/bookings/${booking.publicReference}/extend`)
      .set(manager.headers)
      .send({ checkOut: fixture!.today, reason: 'Fictional guest requested one more night' })
      .expect((extensionResponse) => {
        if (extensionResponse.status !== 200) {
          throw new Error(JSON.stringify(extensionResponse.body));
        }
      });
    expect(bodyAs<{ checkOut: string; status: string }>(extended)).toMatchObject({
      checkOut: fixture!.today,
      status: 'CHECKED_IN',
    });
    expect(
      await fixture!.prisma.bookingNight.findMany({
        where: { bookingId: booking.id },
        orderBy: { stayDate: 'asc' },
        select: { stayDate: true, nightlyPriceToman: true, amountToman: true },
      }),
    ).toEqual([
      {
        stayDate: parseDateOnly(checkIn),
        nightlyPriceToman: 1500n,
        amountToman: 1500n,
      },
      {
        stayDate: parseDateOnly(movedAt),
        nightlyPriceToman: 1500n,
        amountToman: 1500n,
      },
      {
        stayDate: booking.checkOut,
        nightlyPriceToman: 2000n,
        amountToman: 2000n,
      },
    ]);
    expect(
      await fixture!.prisma.roomAssignment.findUniqueOrThrow({ where: { id: assignment.id } }),
    ).toMatchObject({ isActive: true, endDate: parseDateOnly(fixture!.today) });
    expect(
      await fixture!.prisma.roomNightInventory.findUniqueOrThrow({
        where: {
          roomTypeId_stayDate: {
            roomTypeId: property.type.id,
            stayDate: parseDateOnly(booking.checkOut.toISOString().slice(0, 10)),
          },
        },
      }),
    ).toMatchObject({ bookedRooms: 1 });

    const closed = await checkout(booking.id, manager.headers, `${runTag}-extended-checkout`, {
      onAccountReason: 'Fictional extension checkout test',
    }).expect(200);
    expect(
      bodyAs<FolioBody>(closed).entries.filter((entry) => entry.kind === 'ACCOMMODATION'),
    ).toHaveLength(3);
    expect(
      await fixture!.prisma.folioEntry.findMany({
        where: { folio: { bookingId: booking.id }, source: 'ROOM_NIGHT' },
        orderBy: { serviceDate: 'asc' },
        select: { serviceDate: true, amountToman: true, roomNumberSnapshot: true },
      }),
    ).toEqual([
      {
        serviceDate: parseDateOnly(checkIn),
        amountToman: 1500n,
        roomNumberSnapshot: originalRoom.roomNumber,
      },
      {
        serviceDate: parseDateOnly(movedAt),
        amountToman: 1500n,
        roomNumberSnapshot: currentRoom.roomNumber,
      },
      {
        serviceDate: booking.checkOut,
        amountToman: 2000n,
        roomNumberSnapshot: currentRoom.roomNumber,
      },
    ]);
    expect(
      await fixture!.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).toMatchObject({ status: 'CHECKED_OUT', actualDepartureDate: parseDateOnly(fixture!.today) });
    expect(
      await fixture!.prisma.room.findUniqueOrThrow({ where: { id: originalRoom.id } }),
    ).toMatchObject({ housekeepingStatus: 'INSPECTED' });
    expect(
      await fixture!.prisma.room.findUniqueOrThrow({ where: { id: currentRoom.id } }),
    ).toMatchObject({ housekeepingStatus: 'DIRTY' });
    expect(historicalAssignment.isActive).toBe(false);
  });

  it('requires a manager reason for on-account checkout, closes the stay atomically and allows collection', async () => {
    const { booking, assignmentId, roomId } = await createInHouseStay();
    await checkout(booking.id, receptionist.headers, `${runTag}-reception-override`, {
      onAccountReason: 'Authorized test receivable',
    }).expect(403);
    await checkout(booking.id, manager.headers, `${runTag}-manager-no-reason`).expect(400);

    const key = `${runTag}-manager-due`;
    const closed = await checkout(booking.id, manager.headers, key, {
      onAccountReason: 'Fictional guest requested invoice later',
    }).expect(200);
    expect(closed.headers['cache-control']).toBe('private, no-store');
    expect(bodyAs<FolioBody>(closed)).toMatchObject({ status: 'CLOSED_DUE', balanceToman: '1500' });
    expect(
      await fixture!.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).toMatchObject({ status: 'CHECKED_OUT' });
    expect(
      await fixture!.prisma.roomAssignment.findUniqueOrThrow({ where: { id: assignmentId } }),
    ).toMatchObject({ isActive: false });
    expect(await fixture!.prisma.room.findUniqueOrThrow({ where: { id: roomId } })).toMatchObject({
      housekeepingStatus: 'DIRTY',
    });

    const collected = await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/payments`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-collect-due` })
      .send({ amountToman: '1500', method: 'CASH' })
      .expect(200);
    expect(bodyAs<FolioBody>(collected)).toMatchObject({ status: 'CLOSED', balanceToman: '0' });
    await postService(booking.id).expect(409);
  });

  it('retries checkout once, releases only unused nights on early departure, and prevents duplicate room-night posting', async () => {
    const { booking, assignmentId, roomId } = await createInHouseStay();
    const priorNight = await fixture!.prisma.$transaction((transaction) =>
      fixture!.folios.postAccommodationNight(transaction, {
        bookingId: booking.id,
        roomAssignmentId: assignmentId,
        stayDate: booking.checkIn,
        actorStaffUserId: manager.id,
      }),
    );
    expect(priorNight.idempotent).toBe(false);
    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/payments`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-early-stay-settlement` })
      .send({ amountToman: '1500', method: 'CASH' })
      .expect(200);
    const before = await fixture!.prisma.roomNightInventory.findUniqueOrThrow({
      where: {
        roomTypeId_stayDate: {
          roomTypeId: property.type.id,
          stayDate: parseDateOnly(fixture!.today),
        },
      },
    });
    expect(before.bookedRooms).toBeGreaterThan(0);

    const key = `${runTag}-zero-balance-checkout`;
    const first = await checkout(booking.id, manager.headers, key).expect(200);
    await checkout(booking.id, manager.headers, key).expect(200);
    expect(bodyAs<FolioBody>(first).status).toBe('CLOSED');
    expect(
      await fixture!.prisma.folioEntry.count({
        where: { folio: { bookingId: booking.id }, source: 'ROOM_NIGHT' },
      }),
    ).toBe(1);
    expect(
      await fixture!.prisma.roomNightInventory.findUniqueOrThrow({
        where: {
          roomTypeId_stayDate: {
            roomTypeId: property.type.id,
            stayDate: parseDateOnly(fixture!.today),
          },
        },
      }),
    ).toMatchObject({ bookedRooms: before.bookedRooms - 1 });
    expect(
      await fixture!.prisma.roomAssignment.findUniqueOrThrow({ where: { id: assignmentId } }),
    ).toMatchObject({ isActive: false });
    expect(await fixture!.prisma.room.findUniqueOrThrow({ where: { id: roomId } })).toMatchObject({
      housekeepingStatus: 'DIRTY',
    });
  });

  it('serializes a charge racing checkout and permits only a manager override for a remaining receivable', async () => {
    const { booking } = await createInHouseStay();
    const [chargeResult, checkoutResult] = await Promise.allSettled([
      postService(booking.id, `${runTag}-race-service`),
      checkout(booking.id, manager.headers, `${runTag}-race-checkout`, {
        onAccountReason: 'Fictional settlement race test',
      }),
    ]);
    expect(checkoutResult.status).toBe('fulfilled');
    if (checkoutResult.status === 'fulfilled') expect(checkoutResult.value.status).toBe(200);
    expect(chargeResult.status).toBe('fulfilled');
    if (chargeResult.status === 'fulfilled')
      expect([200, 409]).toContain(chargeResult.value.status);
    expect(
      await fixture!.prisma.folioEntry.count({
        where: { folio: { bookingId: booking.id }, source: 'ROOM_NIGHT' },
      }),
    ).toBe(1);
    expect(
      await fixture!.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).toMatchObject({ status: 'CHECKED_OUT' });
  });

  it('rolls back room-night, inventory, assignment, room and stay changes when checkout audit fails', async () => {
    const { booking, assignmentId, roomId } = await createInHouseStay();
    const businessNight = await fixture!.prisma.roomNightInventory.findUniqueOrThrow({
      where: {
        roomTypeId_stayDate: {
          roomTypeId: property.type.id,
          stayDate: parseDateOnly(fixture!.today),
        },
      },
    });
    const audit = new AuditService();
    const record = jest
      .spyOn(audit, 'record')
      .mockImplementation((_tx, event) =>
        event.eventName === 'BOOKING_CHECKED_OUT'
          ? Promise.reject(new Error('forced checkout audit failure'))
          : Promise.resolve(),
      );
    const service = new FoliosService(fixture!.prisma, audit);

    await expect(
      service.checkout(
        {
          id: manager.id,
          username: 'fictional-manager',
          email: 'manager@example.invalid',
          role: 'MANAGER',
          mustChangePassword: false,
        },
        booking.id,
        { onAccountReason: 'Rollback test account reason' },
        `${runTag}-rollback-checkout`,
      ),
    ).rejects.toThrow('forced checkout audit failure');

    expect(record).toHaveBeenCalled();
    expect(
      await fixture!.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).toMatchObject({ status: 'CHECKED_IN' });
    expect(
      await fixture!.prisma.folio.findUniqueOrThrow({ where: { bookingId: booking.id } }),
    ).toMatchObject({
      status: 'OPEN',
      checkoutIdempotencyKey: null,
    });
    expect(
      await fixture!.prisma.folioEntry.count({
        where: { folio: { bookingId: booking.id }, source: 'ROOM_NIGHT' },
      }),
    ).toBe(0);
    expect(
      await fixture!.prisma.roomNightInventory.findUniqueOrThrow({
        where: {
          roomTypeId_stayDate: {
            roomTypeId: property.type.id,
            stayDate: parseDateOnly(fixture!.today),
          },
        },
      }),
    ).toMatchObject({ bookedRooms: businessNight.bookedRooms });
    expect(
      await fixture!.prisma.roomAssignment.findUniqueOrThrow({ where: { id: assignmentId } }),
    ).toMatchObject({ isActive: true });
    expect(await fixture!.prisma.room.findUniqueOrThrow({ where: { id: roomId } })).toMatchObject({
      housekeepingStatus: 'INSPECTED',
    });
  });

  it('serves an authenticated private printable statement and denies unauthorized roles', async () => {
    const { booking } = await createInHouseStay();
    const printPath = `${api}/folios/${booking.id}/print`;
    await fixture!.client().get(printPath).expect(401).expect('Cache-Control', 'private, no-store');
    await fixture!
      .client()
      .get(printPath)
      .set(housekeeper.headers)
      .expect(403)
      .expect('Cache-Control', 'private, no-store');

    const response = await fixture!
      .client()
      .get(printPath)
      .set(cashier.headers)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(
      bodyAs<{ label: string; folio: { booking: { id: string; guestName: string } } }>(response),
    ).toMatchObject({
      label: 'Interim folio',
      folio: { booking: { id: booking.id, guestName: 'Test Guest' } },
    });
    expect(bodyAs<{ printedAt: string }>(response).printedAt).toEqual(expect.any(String));
  });
});
