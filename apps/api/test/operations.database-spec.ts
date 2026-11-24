import { randomUUID } from 'node:crypto';
import { addDays } from '../src/availability/date-range';
import type {
  NightClosePreviewDto,
  NightCloseResultDto,
  StaffOperationsReportDto,
} from '../src/operations/dto/operations.dto';
import { RoomBoardFixture } from './room-board-fixture';

const api = '/api/v1/staff';
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateString = (value: Date) => value.toISOString().slice(0, 10);

function responseBody<T>(response: { body: unknown }): T {
  return response.body as T;
}

describe('PostgreSQL business date, night close, and reports', () => {
  let fixture: RoomBoardFixture | undefined;
  let hotelId: string;
  let roomTypeId: string;
  let roomIds: string[];
  let manager: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let receptionist: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let businessDate: string;
  let originalBusinessDate: string;
  let testDayIndex = 0;
  const bookingIds: string[] = [];
  const tag = randomUUID().replaceAll('-', '').slice(0, 12);

  async function setBusinessDate(value: string) {
    await fixture!.prisma.$executeRaw`
      UPDATE hotels SET business_date = ${asDate(value)}::date WHERE id = ${hotelId}::uuid
    `;
  }

  async function createBooking(options: {
    checkIn: string;
    checkOut?: string;
    status?: 'CONFIRMED' | 'CHECKED_IN';
    roomIndex?: number;
    assigned?: boolean;
  }) {
    const booking = await fixture!.booking(roomTypeId, 1, options.checkIn);
    bookingIds.push(booking.id);
    const checkOut = options.checkOut ?? addDays(options.checkIn, 2);
    for (const stayDate of [options.checkIn, addDays(options.checkIn, 1)]) {
      await fixture!.prisma.roomNightInventory.upsert({
        where: { roomTypeId_stayDate: { roomTypeId, stayDate: asDate(stayDate) } },
        create: {
          roomTypeId,
          stayDate: asDate(stayDate),
          totalRooms: 10,
          bookedRooms: 1,
          nightlyPriceToman: 1500n,
        },
        update: { bookedRooms: { increment: 1 } },
      });
    }
    await fixture!.prisma.booking.update({
      where: { id: booking.id },
      data: {
        checkOut: asDate(checkOut),
        status: options.status ?? 'CONFIRMED',
        ...(options.status === 'CHECKED_IN' ? { checkedInAt: new Date() } : {}),
      },
    });
    if (options.assigned) {
      const assignment = await fixture!.prisma.roomAssignment.create({
        data: {
          bookingId: booking.id,
          roomId: roomIds[options.roomIndex ?? 0],
          roomTypeId,
          startDate: asDate(options.checkIn),
          endDate: asDate(checkOut),
        },
      });
      return { booking, assignment };
    }
    return { booking, assignment: null };
  }

  async function preview(): Promise<NightClosePreviewDto> {
    return fixture!
      .client()
      .get(`${api}/operations/close`)
      .set(manager.headers)
      .expect(200)
      .then((response) => responseBody<NightClosePreviewDto>(response));
  }

  function confirmation(previewBody: {
    businessDate: string;
    nextBusinessDate: string;
    accommodation: { roomNightCount: number; amountToman: string };
    warningCount: number;
  }) {
    return {
      businessDate: previewBody.businessDate,
      confirmation: {
        businessDate: previewBody.businessDate,
        nextBusinessDate: previewBody.nextBusinessDate,
        roomNightCount: previewBody.accommodation.roomNightCount,
        accommodationAmountToman: previewBody.accommodation.amountToman,
        warningCount: previewBody.warningCount,
      },
    };
  }

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
    const oldFixtures = await fixture.prisma.hotel.findMany({
      where: { slug: { startsWith: 'hpm009-' } },
      select: { id: true },
    });
    await fixture.prisma.nightCloseRun.deleteMany({
      where: { hotelId: { in: oldFixtures.map(({ id }) => id) } },
    });
    await fixture.prisma.hotel.deleteMany({ where: { slug: { startsWith: 'hpm009-' } } });
    const property = await fixture.createProperty(
      'Asia/Tehran',
      new Date('1900-01-01T00:00:00.000Z'),
      `hpm009-${tag}`,
    );
    hotelId = property.hotel.id;
    const initialDate = await fixture.prisma.$queryRaw<Array<{ businessDate: Date }>>`
      SELECT business_date AS "businessDate" FROM hotels WHERE id = ${hotelId}::uuid
    `;
    originalBusinessDate = dateString(initialDate[0].businessDate);
    businessDate = originalBusinessDate;
    roomTypeId = property.type.id;
    roomIds = property.rooms.map(({ id }) => id);
    manager = await fixture.staff('MANAGER');
    receptionist = await fixture.staff('RECEPTIONIST');
  });

  beforeEach(async () => {
    businessDate = addDays(originalBusinessDate, testDayIndex++);
    await setBusinessDate(businessDate);
  });

  afterEach(async () => {
    await fixture!.prisma.$executeRawUnsafe(
      'ALTER TABLE folio_entries DISABLE TRIGGER folio_entries_are_immutable',
    );
    try {
      for (const bookingId of bookingIds) {
        const folio = await fixture!.prisma.folio.findUnique({
          where: { bookingId },
          select: { id: true },
        });
        if (folio) {
          await fixture!.prisma.folioEntry.deleteMany({ where: { folioId: folio.id } });
          await fixture!.prisma.folio.delete({ where: { id: folio.id } });
        }
        await fixture!.prisma.roomAssignment.deleteMany({ where: { bookingId } });
        await fixture!.prisma.booking.delete({ where: { id: bookingId } });
      }
    } finally {
      await fixture!.prisma.$executeRawUnsafe(
        'ALTER TABLE folio_entries ENABLE TRIGGER folio_entries_are_immutable',
      );
    }
    await fixture!.prisma.nightCloseRun.deleteMany({
      where: { hotelId },
    });
    await fixture!.prisma.roomBlock.deleteMany({ where: { roomId: { in: roomIds } } });
    await fixture!.prisma.roomNightInventory.deleteMany({ where: { roomTypeId } });
    bookingIds.length = 0;
  });

  afterAll(async () => {
    if (!fixture) return;
    await fixture.prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS hpm009_fail_date_advance ON hotels',
    );
    await fixture.prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS hpm009_fail_business_date_advance()',
    );
    await fixture.prisma.$executeRawUnsafe(
      'ALTER TABLE folio_entries DISABLE TRIGGER folio_entries_are_immutable',
    );
    try {
      for (const bookingId of bookingIds) {
        const folio = await fixture.prisma.folio.findUnique({
          where: { bookingId },
          select: { id: true },
        });
        if (folio) {
          await fixture.prisma.folioEntry.deleteMany({ where: { folioId: folio.id } });
          await fixture.prisma.folio.delete({ where: { id: folio.id } });
        }
        await fixture.prisma.roomAssignment.deleteMany({ where: { bookingId } });
        await fixture.prisma.booking.delete({ where: { id: bookingId } });
      }
    } finally {
      await fixture.prisma.$executeRawUnsafe(
        'ALTER TABLE folio_entries ENABLE TRIGGER folio_entries_are_immutable',
      );
    }
    await fixture.prisma.roomBlock.deleteMany({ where: { roomId: { in: roomIds } } });
    await fixture.prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await fixture.prisma.nightCloseRun.deleteMany({ where: { hotelId } });
    await fixture.prisma.roomType.delete({ where: { id: roomTypeId } });
    await fixture.prisma.$executeRaw`
      UPDATE hotels SET business_date = ${asDate(originalBusinessDate)}::date WHERE id = ${hotelId}::uuid
    `;
    await fixture.close();
  });

  it('separates unresolved due-ins and due-outs from warnings and protects manager access', async () => {
    await createBooking({ checkIn: businessDate });
    await createBooking({ checkIn: addDays(businessDate, 1) });
    await createBooking({
      checkIn: addDays(businessDate, -2),
      checkOut: businessDate,
      status: 'CHECKED_IN',
      assigned: true,
      roomIndex: 0,
    });
    const missingAssignment = await createBooking({ checkIn: businessDate, status: 'CHECKED_IN' });
    const invariantStay = await createBooking({ checkIn: businessDate, status: 'CHECKED_IN' });
    await fixture!.prisma.roomAssignment.createMany({
      data: [0, 2].map((index) => ({
        bookingId: invariantStay.booking.id,
        roomId: roomIds[index],
        roomTypeId,
        startDate: asDate(businessDate),
        endDate: asDate(addDays(businessDate, 2)),
      })),
    });
    const missingFolio = await fixture!.prisma.folio.findUniqueOrThrow({
      where: { bookingId: missingAssignment.booking.id },
      select: { id: true },
    });
    await fixture!.prisma.folioEntry.create({
      data: {
        folioId: missingFolio.id,
        direction: 'DEBIT',
        kind: 'SERVICE',
        amountToman: 500n,
        serviceDate: asDate(businessDate),
        descriptionSnapshot: 'Fictional minibar charge',
        source: 'TEST_FIXTURE',
      },
    });
    await fixture!.prisma.roomBlock.create({
      data: {
        roomId: roomIds[1],
        startDate: asDate(businessDate),
        endDate: asDate(addDays(businessDate, 1)),
        kind: 'OUT_OF_ORDER',
        reason: 'Test maintenance block',
      },
    });
    await fixture!.prisma.nightCloseRun.create({
      data: {
        hotelId,
        businessDate: asDate(addDays(businessDate, -1)),
        nextBusinessDate: asDate(businessDate),
        status: 'RUNNING',
        actorStaffUserId: manager.id,
      },
    });

    expect(await fixture!.prisma.booking.count({ where: { roomType: { hotelId } } })).toBe(5);
    expect(
      await fixture!.prisma.hotel.findFirstOrThrow({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
    ).toEqual({ id: hotelId });

    const denied = await fixture!
      .client()
      .get(`${api}/operations/close`)
      .set(receptionist.headers)
      .expect(403);
    expect(denied.headers['cache-control']).toBe('private, no-store');
    await fixture!
      .client()
      .post(`${api}/operations/close`)
      .set(receptionist.headers)
      .send({})
      .expect(403);
    await fixture!.client().get(`${api}/reports`).set(receptionist.headers).expect(403);

    const result = await fixture!
      .client()
      .get(`${api}/operations/close`)
      .set(manager.headers)
      .expect(200);
    const resultBody = responseBody<NightClosePreviewDto>(result);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(resultBody).toMatchObject({ businessDate, nextBusinessDate: addDays(businessDate, 1) });
    expect(resultBody.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UNRESOLVED_DUE_IN', count: 1 }),
        expect.objectContaining({ code: 'UNHANDLED_DUE_OUT', count: 1 }),
        expect.objectContaining({ code: 'MISSING_CHECKED_IN_ASSIGNMENT', count: 1 }),
        expect.objectContaining({ code: 'FAILED_INVARIANT', count: 1 }),
        expect.objectContaining({ code: 'PREVIOUS_CLOSE_INCOMPLETE', count: 1 }),
      ]),
    );
    expect(resultBody.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ACTIVE_IN_HOUSE', count: 2 }),
        expect.objectContaining({ code: 'MAINTENANCE_BLOCK', count: 1 }),
        expect.objectContaining({ code: 'OPEN_RECEIVABLE', count: 1 }),
        expect.objectContaining({ code: 'UPCOMING_ARRIVAL', count: 1 }),
      ]),
    );
    await fixture!
      .client()
      .post(`${api}/operations/close`)
      .set(manager.headers)
      .send(confirmation(resultBody))
      .expect(409);
  });

  it('posts one room-night, advances once, replays safely, and shares checkout idempotency', async () => {
    const { booking } = await createBooking({
      checkIn: businessDate,
      status: 'CHECKED_IN',
      assigned: true,
    });
    const closePreview = await preview();
    expect(closePreview.blockers).toHaveLength(0);
    expect(closePreview.accommodation).toEqual({ roomNightCount: 1, amountToman: '1500' });

    const payload = confirmation(closePreview);
    const closed = await fixture!
      .client()
      .post(`${api}/operations/close`)
      .set(manager.headers)
      .send(payload)
      .expect(200);
    expect(closed.headers['cache-control']).toBe('private, no-store');
    const closedBody = responseBody<NightCloseResultDto>(closed);
    expect(closedBody).toMatchObject({
      businessDate,
      nextBusinessDate: addDays(businessDate, 1),
      status: 'COMPLETED',
      roomNightCount: 1,
      accommodationAmountToman: '1500',
    });

    const replay = await fixture!
      .client()
      .post(`${api}/operations/close`)
      .set(manager.headers)
      .send(payload)
      .expect(200);
    const replayBody = responseBody<NightCloseResultDto>(replay);
    expect(replayBody).toMatchObject({ ...closedBody, replayed: true });
    expect(
      await fixture!.prisma.folioEntry.count({
        where: { source: 'ROOM_NIGHT', serviceDate: asDate(businessDate) },
      }),
    ).toBe(1);
    const advanced = await fixture!.prisma.$queryRaw<Array<{ businessDate: Date }>>`
      SELECT business_date AS "businessDate" FROM hotels WHERE id = ${hotelId}::uuid
    `;
    expect(dateString(advanced[0].businessDate)).toBe(addDays(businessDate, 1));
    const roomBoard = await fixture!
      .client()
      .get(`${api}/rooms/board`)
      .set(manager.headers)
      .expect(200);
    expect(responseBody<{ businessDate: string }>(roomBoard).businessDate).toBe(
      addDays(businessDate, 1),
    );

    const report = await fixture!
      .client()
      .get(`${api}/reports`)
      .set(manager.headers)
      .query({ date: businessDate })
      .expect(200);
    expect(report.headers['cache-control']).toBe('private, no-store');
    const reportBody = responseBody<StaffOperationsReportDto>(report);
    expect(reportBody.dailyTotals).toEqual({ debitsToman: '1500', creditsToman: '0' });
    expect(reportBody.openBalances).toMatchObject({ count: 1, balanceToman: '1500' });
    expect(JSON.stringify(reportBody)).not.toContain('+989121234567');
    expect(JSON.stringify(reportBody)).not.toContain('guest@example.invalid');
    expect(reportBody.inHouse).toEqual(
      expect.arrayContaining([expect.objectContaining({ reference: booking.publicReference })]),
    );

    const payment = await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/payments`)
      .set({ ...manager.headers, 'Idempotency-Key': `${tag}-payment-after-close` })
      .send({ amountToman: '1500', method: 'CASH' })
      .expect(200);
    const paymentBody = responseBody<{
      entries: Array<{ kind: string; serviceDate: string; amountToman: string }>;
    }>(payment);
    expect(paymentBody.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'PAYMENT',
          serviceDate: addDays(businessDate, 1),
          amountToman: '1500',
        }),
      ]),
    );
    const nextDayReport = await fixture!
      .client()
      .get(`${api}/reports`)
      .set(manager.headers)
      .query({ date: addDays(businessDate, 1) })
      .expect(200);
    const nextDayReportBody = responseBody<StaffOperationsReportDto>(nextDayReport);
    expect(nextDayReportBody.dailyTotals).toEqual({ debitsToman: '0', creditsToman: '1500' });
    expect(JSON.stringify(nextDayReportBody)).not.toContain('+989121234567');
    expect(JSON.stringify(nextDayReportBody)).not.toContain('guest@example.invalid');

    await fixture!
      .client()
      .post(`${api}/folios/${booking.id}/checkout`)
      .set({ ...manager.headers, 'Idempotency-Key': `${tag}-cross-path-checkout` })
      .send({ onAccountReason: 'Test collection after checkout' })
      .expect(200);
    const historicalStayReport = await fixture!
      .client()
      .get(`${api}/reports`)
      .set(manager.headers)
      .query({ date: businessDate })
      .expect(200);
    expect(responseBody<StaffOperationsReportDto>(historicalStayReport).inHouse).toEqual(
      expect.arrayContaining([expect.objectContaining({ reference: booking.publicReference })]),
    );
    expect(
      await fixture!.prisma.folioEntry.count({
        where: {
          roomAssignmentId: { not: null },
          serviceDate: asDate(businessDate),
          source: 'ROOM_NIGHT',
        },
      }),
    ).toBe(1);
  });

  it('rejects a close confirmation when the preview amount has changed', async () => {
    await createBooking({ checkIn: businessDate, status: 'CHECKED_IN', assigned: true });
    const closePreview = await preview();
    const stalePayload = confirmation(closePreview);
    stalePayload.confirmation.accommodationAmountToman = '1499';

    const stale = await fixture!
      .client()
      .post(`${api}/operations/close`)
      .set(manager.headers)
      .send(stalePayload)
      .expect(409);
    expect(responseBody<{ code: string }>(stale).code).toBe('NIGHT_CLOSE_CONFIRMATION_STALE');
    expect(
      await fixture!.prisma.folioEntry.count({
        where: { source: 'ROOM_NIGHT', serviceDate: asDate(businessDate) },
      }),
    ).toBe(0);
    const current = await fixture!.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { businessDate: true },
    });
    expect(dateString(current.businessDate)).toBe(businessDate);
  });

  it('rolls back inserted charges and close state after a date-advance failure, then retries', async () => {
    await createBooking({ checkIn: businessDate, status: 'CHECKED_IN', assigned: true });
    const closePreview = await preview();
    const payload = confirmation(closePreview);
    await fixture!.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION hpm009_fail_business_date_advance() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.business_date <> OLD.business_date THEN
          RAISE EXCEPTION 'injected HPM-009 date advance failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await fixture!.prisma.$executeRawUnsafe(`
      CREATE TRIGGER hpm009_fail_date_advance
      BEFORE UPDATE OF business_date ON hotels
      FOR EACH ROW EXECUTE FUNCTION hpm009_fail_business_date_advance()
    `);

    await fixture!
      .client()
      .post(`${api}/operations/close`)
      .set(manager.headers)
      .send(payload)
      .expect(500);
    expect(
      await fixture!.prisma.folioEntry.count({
        where: { source: 'ROOM_NIGHT', serviceDate: asDate(businessDate) },
      }),
    ).toBe(0);
    const rolledBack = await fixture!.prisma.$queryRaw<Array<{ businessDate: Date }>>`
      SELECT business_date AS "businessDate" FROM hotels WHERE id = ${hotelId}::uuid
    `;
    expect(dateString(rolledBack[0].businessDate)).toBe(businessDate);

    await fixture!.prisma.$executeRawUnsafe('DROP TRIGGER hpm009_fail_date_advance ON hotels');
    await fixture!.prisma.$executeRawUnsafe('DROP FUNCTION hpm009_fail_business_date_advance()');
    const retried = await fixture!
      .client()
      .post(`${api}/operations/close`)
      .set(manager.headers)
      .send(payload)
      .expect(200);
    expect(responseBody<NightCloseResultDto>(retried).status).toBe('COMPLETED');
    expect(
      await fixture!.prisma.folioEntry.count({
        where: { source: 'ROOM_NIGHT', serviceDate: asDate(businessDate) },
      }),
    ).toBe(1);
  });
});
