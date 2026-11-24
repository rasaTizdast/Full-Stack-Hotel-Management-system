import { randomUUID } from 'node:crypto';
import { addDays, parseDateOnly } from '../src/availability/date-range';
import { FoliosService } from '../src/folios/folios.service';
import type { StaffFolioDto } from '../src/folios/dto/folio.dto';
import { RoomBoardFixture } from './room-board-fixture';

const api = '/api/v1/staff';

describe('PostgreSQL folio ledger and service catalog', () => {
  const runTag = 'HPM007-' + randomUUID();
  let fixture: RoomBoardFixture | undefined;
  let property: Awaited<ReturnType<RoomBoardFixture['createProperty']>>;
  let manager: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let receptionist: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let cashier: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let serviceItem: { id: string; name: string };
  let booking: Awaited<ReturnType<RoomBoardFixture['booking']>>;
  let assignmentId: string;

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
    property = await fixture.createProperty('Asia/Tehran', undefined, randomUUID());
    manager = await fixture.staff('MANAGER');
    receptionist = await fixture.staff('RECEPTIONIST');
    cashier = await fixture.staff('CASHIER');
    booking = await fixture.booking(property.type.id, 1, fixture.today);
    await fixture.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CHECKED_IN', checkedInAt: new Date() },
    });
    const assignment = await fixture.prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomId: property.rooms[0].id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(fixture.today),
        endDate: parseDateOnly(addDays(fixture.today, 2)),
      },
    });
    assignmentId = assignment.id;
    const created = await fixture
      .client()
      .post(`${api}/services`)
      .set(manager.headers)
      .send({
        name: `${runTag} Breakfast`,
        category: 'Food',
        currentPriceToman: '125000',
      })
      .expect(201);
    serviceItem = created.body as { id: string; name: string };
  });

  afterAll(async () => {
    await fixture?.close({ preserveData: true });
  });

  it('creates one folio automatically for every stay and exposes a private empty ledger', async () => {
    const folio = await fixture!.prisma.folio.findUnique({ where: { bookingId: booking.id } });
    expect(folio).toMatchObject({ bookingId: booking.id, status: 'OPEN' });
    expect(await fixture!.prisma.folio.count({ where: { bookingId: booking.id } })).toBe(1);

    const response = await fixture!
      .client()
      .get(`${api}/folios/${booking.id}`)
      .set(manager.headers)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toMatchObject({
      booking: { id: booking.id, status: 'CHECKED_IN' },
      status: 'OPEN',
      balanceToman: '0',
      entries: [],
    });

    const lookup = await fixture!
      .client()
      .get(`${api}/folios/lookup`)
      .query({ reference: booking.publicReference })
      .set(cashier.headers)
      .expect(200);
    expect(lookup.headers['cache-control']).toBe('private, no-store');
    expect(lookup.body).toEqual({
      bookingId: booking.id,
      reference: booking.publicReference,
      guestName: booking.guestName,
      checkIn: fixture!.today,
      checkOut: addDays(fixture!.today, 2),
      folioStatus: 'OPEN',
      balanceToman: '0',
    });
    expect(lookup.body).not.toHaveProperty('guestPhone');
    expect(lookup.body).not.toHaveProperty('guestEmail');
    expect(lookup.body).not.toHaveProperty('entries');
  });

  it('enforces service-catalog permissions, positive whole-Toman price and case-insensitive unique names', async () => {
    const catalog = await fixture!
      .client()
      .get('/api/v1/staff/services')
      .set(manager.headers)
      .expect(200);
    expect(catalog.headers['cache-control']).toBe('private, no-store');
    await fixture!
      .client()
      .post(`${api}/services`)
      .set(receptionist.headers)
      .send({ name: `${runTag} Denied`, category: 'Food', currentPriceToman: '10' })
      .expect(403)
      .expect('Cache-Control', 'private, no-store');
    await fixture!
      .client()
      .post(`${api}/services`)
      .set(manager.headers)
      .send({ name: `${runTag} Invalid`, category: 'Food', currentPriceToman: '0' })
      .expect(400);
    await fixture!
      .client()
      .post(`${api}/services`)
      .set(manager.headers)
      .send({ name: serviceItem.name.toUpperCase(), category: 'Food', currentPriceToman: '1' })
      .expect(409);
  });

  it('posts a room-attributed service once with immutable name/price snapshots and a running balance', async () => {
    const charge = () =>
      fixture!
        .client()
        .post(`${api}/folios/${booking.id}/services`)
        .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-service-001` })
        .send({
          serviceItemId: serviceItem.id,
          quantity: 2,
          serviceDate: fixture!.today,
          roomAssignmentId: assignmentId,
        });

    const first = await charge().expect(200);
    const firstFolio = first.body as StaffFolioDto;
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(firstFolio).toMatchObject({ balanceToman: '250000' });
    expect(firstFolio.entries).toHaveLength(1);
    expect(firstFolio.entries[0]).toMatchObject({
      kind: 'SERVICE',
      direction: 'DEBIT',
      amountToman: '250000',
      description: serviceItem.name,
      quantity: 2,
      unitAmountToman: '125000',
      roomNumber: '101',
      balanceAfterToman: '250000',
    });
    await charge().expect(200);
    expect(
      await fixture!.prisma.folioEntry.count({
        where: { folioId: firstFolio.id, source: 'SERVICE' },
      }),
    ).toBe(1);

    await fixture!
      .client()
      .patch(`${api}/services/${serviceItem.id}`)
      .set(manager.headers)
      .send({ name: `${runTag} Breakfast Deluxe`, currentPriceToman: '180000' })
      .expect(200);
    const stored = await fixture!.prisma.folioEntry.findFirstOrThrow({
      where: { folioId: firstFolio.id },
    });
    expect(stored.descriptionSnapshot).toBe(serviceItem.name);
    expect(stored.unitAmountToman).toBe(125000n);

    const managerView = await fixture!
      .client()
      .get(`${api}/folios/${booking.id}`)
      .set(manager.headers)
      .expect(200);
    const managerFolio = managerView.body as StaffFolioDto;
    expect(managerFolio.entries[0].roomNumber).toBeNull();
  });

  it('rejects reused keys with changed intent, invalid stay dates, missing assignment and non-in-house stays', async () => {
    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/services`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-service-001` })
      .send({ serviceItemId: serviceItem.id, quantity: 3, serviceDate: fixture!.today })
      .expect(409);
    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/services`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-service-002` })
      .send({
        serviceItemId: serviceItem.id,
        quantity: 1,
        serviceDate: addDays(fixture!.today, 2),
      })
      .expect(409);
    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/services`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-service-003` })
      .send({
        serviceItemId: serviceItem.id,
        quantity: 1,
        serviceDate: fixture!.today,
        roomAssignmentId: randomUUID(),
      })
      .expect(409);

    const confirmed = await fixture!.booking(property.type.id, 1, fixture!.today);
    await fixture!
      .client()
      .post(`${api}/folios/${confirmed.id}/services`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-service-004` })
      .send({ serviceItemId: serviceItem.id, quantity: 1, serviceDate: fixture!.today })
      .expect(409);
    expect(
      await fixture!.prisma.folioEntry.count({ where: { folio: { bookingId: confirmed.id } } }),
    ).toBe(0);
  });

  it('appends bounded manager corrections while rejecting cashier adjustment and source mutation', async () => {
    const service = await fixture!.prisma.folioEntry.findFirstOrThrow({
      where: { folio: { bookingId: booking.id }, kind: 'SERVICE' },
    });
    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/adjustments`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-adjust-001` })
      .send({ correctsEntryId: service.id, amountToman: '10000', reason: 'Wrong quantity entry' })
      .expect(403);
    const correctionInput = {
      correctsEntryId: service.id,
      amountToman: '10000',
      reason: 'Wrong quantity entry',
    };
    const correctionKey = `${runTag}-adjust-001`;
    const corrected = await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/adjustments`)
      .set({ ...manager.headers, 'Idempotency-Key': correctionKey })
      .send(correctionInput)
      .expect(200);
    const correctedFolio = corrected.body as StaffFolioDto;
    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/adjustments`)
      .set({ ...manager.headers, 'Idempotency-Key': correctionKey })
      .send(correctionInput)
      .expect(200);
    expect(correctedFolio.balanceToman).toBe('240000');
    expect(correctedFolio.entries).toHaveLength(2);
    expect(correctedFolio.entries[1]).toMatchObject({
      direction: 'CREDIT',
      kind: 'ADJUSTMENT',
      amountToman: '10000',
      correctsEntryId: service.id,
      correctionReason: 'Wrong quantity entry',
    });
    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/adjustments`)
      .set({ ...manager.headers, 'Idempotency-Key': `${runTag}-adjust-002` })
      .send({ correctsEntryId: service.id, amountToman: '300000', reason: 'Too much correction' })
      .expect(409);
    await expect(
      fixture!.prisma.folioEntry.update({
        where: { id: service.id },
        data: { descriptionSnapshot: 'tampered' },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(fixture!.prisma.folioEntry.delete({ where: { id: service.id } })).rejects.toThrow(
      /append-only/,
    );
    await expect(fixture!.prisma.$executeRaw`TRUNCATE TABLE folio_entries`).rejects.toThrow(
      /append-only/,
    );
    expect(
      await fixture!.prisma.folioEntry.findUniqueOrThrow({ where: { id: service.id } }),
    ).toMatchObject({ descriptionSnapshot: serviceItem.name, amountToman: 250000n });
  });

  it('rolls back a service line when its audit write fails inside the posting transaction', async () => {
    const before = await fixture!.prisma.folioEntry.count({
      where: { folio: { bookingId: booking.id } },
    });
    const failingAudit = { record: jest.fn().mockRejectedValue(new Error('forced audit failure')) };
    const service = new FoliosService(fixture!.prisma, failingAudit);
    await expect(
      service.postServiceCharge(
        {
          id: cashier.id,
          username: 'fictional-cashier',
          email: 'cashier@example.invalid',
          role: 'CASHIER',
          mustChangePassword: false,
        },
        booking.id,
        {
          serviceItemId: serviceItem.id,
          quantity: 1,
          serviceDate: fixture!.today,
        },
        `${runTag}-rollback-001`,
      ),
    ).rejects.toThrow('forced audit failure');
    expect(
      await fixture!.prisma.folioEntry.count({ where: { folio: { bookingId: booking.id } } }),
    ).toBe(before);
    expect(failingAudit.record).toHaveBeenCalledTimes(1);
  });

  it('uses the same room-night idempotency key on repeat and keeps checkout-date excluded', async () => {
    const post = () =>
      fixture!.prisma.$transaction((tx) =>
        fixture!.folios.postAccommodationNight(tx, {
          bookingId: booking.id,
          roomAssignmentId: assignmentId,
          stayDate: parseDateOnly(fixture!.today),
          actorStaffUserId: manager.id,
        }),
      );
    const first = await post();
    const retry = await post();
    expect(first).toMatchObject({ idempotent: false, amountToman: 1500n });
    expect(retry).toMatchObject({ id: first.id, idempotent: true, amountToman: 1500n });
    expect(
      await fixture!.prisma.folioEntry.findMany({
        where: { idempotencyKey: `room-night:${assignmentId}:${fixture!.today}` },
      }),
    ).toHaveLength(1);

    await expect(
      fixture!.prisma.$transaction((tx) =>
        fixture!.folios.postAccommodationNight(tx, {
          bookingId: booking.id,
          roomAssignmentId: assignmentId,
          stayDate: parseDateOnly(addDays(fixture!.today, 2)),
          actorStaffUserId: manager.id,
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'SERVICE_DATE_OUTSIDE_STAY' },
    });
  });

  it('deactivates a catalog item without changing existing folio snapshots', async () => {
    const original = await fixture!.prisma.folioEntry.findFirstOrThrow({
      where: { folio: { bookingId: booking.id }, kind: 'SERVICE' },
      orderBy: { createdAt: 'asc' },
    });
    await fixture!
      .client()
      .patch(`${api}/services/${serviceItem.id}`)
      .set(manager.headers)
      .send({ isActive: false })
      .expect(200);

    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/services`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-service-inactive` })
      .send({ serviceItemId: serviceItem.id, quantity: 1, serviceDate: fixture!.today })
      .expect(404);
    const stored = await fixture!.prisma.folioEntry.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(stored).toMatchObject({ descriptionSnapshot: serviceItem.name, amountToman: 250000n });
    const cashierList = await fixture!
      .client()
      .get(`${api}/services`)
      .set(cashier.headers)
      .expect(200);
    const cashierCatalog = cashierList.body as { items: Array<{ id: string }> };
    expect(cashierCatalog.items).not.toContainEqual(
      expect.objectContaining({ id: serviceItem.id }),
    );
    const managerList = await fixture!
      .client()
      .get(`${api}/services`)
      .set(manager.headers)
      .expect(200);
    const managerCatalog = managerList.body as { items: Array<{ id: string; isActive: boolean }> };
    expect(managerCatalog.items).toContainEqual(
      expect.objectContaining({ id: serviceItem.id, isActive: false }),
    );
  });

  it('finds receivable folios and hides checked-out-settled and pre-check-in bookings', async () => {
    const lookupService = await fixture!
      .client()
      .post(`${api}/services`)
      .set(manager.headers)
      .send({
        name: `${runTag} Lookup service`,
        category: 'Test',
        currentPriceToman: '125000',
      })
      .expect(201);
    const lookupServiceId = (lookupService.body as { id: string }).id;
    const receivableCheckIn = addDays(fixture!.today, -1);
    const receivable = await fixture!.booking(property.type.id, 1, receivableCheckIn);
    await fixture!.prisma.booking.update({
      where: { id: receivable.id },
      data: { status: 'CHECKED_IN', checkedInAt: new Date() },
    });
    await fixture!.prisma.roomAssignment.create({
      data: {
        bookingId: receivable.id,
        roomId: property.rooms[1].id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(receivableCheckIn),
        endDate: receivable.checkOut,
      },
    });
    await fixture!.prisma.roomNightInventory.upsert({
      where: {
        roomTypeId_stayDate: {
          roomTypeId: property.type.id,
          stayDate: parseDateOnly(fixture!.today),
        },
      },
      create: {
        roomTypeId: property.type.id,
        stayDate: parseDateOnly(fixture!.today),
        totalRooms: 100,
        bookedRooms: 1,
        nightlyPriceToman: 1500n,
      },
      update: { bookedRooms: { increment: 1 } },
    });
    await fixture!
      .client()
      .post(`${api}/folios/${receivable.id}/services`)
      .set({ ...cashier.headers, 'Idempotency-Key': `${runTag}-lookup-due-charge` })
      .send({ serviceItemId: lookupServiceId, quantity: 1, serviceDate: fixture!.today })
      .expect(200);
    await fixture!
      .client()
      .post(`${api}/folios/${receivable.id}/checkout`)
      .set({ ...manager.headers, 'Idempotency-Key': `${runTag}-lookup-due-checkout` })
      .send({ onAccountReason: 'Fictional test receivable' })
      .expect(200);

    const dueLookup = await fixture!
      .client()
      .get(`${api}/folios/lookup`)
      .query({ reference: receivable.publicReference })
      .set(cashier.headers)
      .expect(200);
    expect(dueLookup.body).toMatchObject({
      bookingId: receivable.id,
      reference: receivable.publicReference,
      folioStatus: 'CLOSED_DUE',
      balanceToman: '126500',
    });
    expect(dueLookup.body).not.toHaveProperty('guestPhone');
    expect(dueLookup.body).not.toHaveProperty('guestEmail');
    expect(dueLookup.body).not.toHaveProperty('entries');

    const settled = await fixture!.booking(property.type.id, 1, fixture!.today);
    await fixture!.prisma.booking.update({
      where: { id: settled.id },
      data: { status: 'CHECKED_IN', checkedInAt: new Date() },
    });
    await fixture!.prisma.roomAssignment.create({
      data: {
        bookingId: settled.id,
        roomId: property.rooms[2].id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(fixture!.today),
        endDate: parseDateOnly(addDays(fixture!.today, 2)),
      },
    });
    for (const stayDate of [fixture!.today, addDays(fixture!.today, 1)]) {
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
    await fixture!
      .client()
      .post(`${api}/folios/${settled.id}/checkout`)
      .set({ ...manager.headers, 'Idempotency-Key': `${runTag}-lookup-settled-checkout` })
      .send({})
      .expect(200);

    await fixture!
      .client()
      .get(`${api}/folios/lookup`)
      .query({ reference: settled.publicReference })
      .set(cashier.headers)
      .expect(404);

    const confirmed = await fixture!.booking(property.type.id, 1, fixture!.today);
    await fixture!
      .client()
      .get(`${api}/folios/lookup`)
      .query({ reference: confirmed.publicReference })
      .set(cashier.headers)
      .expect(404);
  });
});
