import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { addDays, getHotelBusinessDate } from '../src/availability/date-range';
import { AppModule } from '../src/app.module';
import { BookingsService } from '../src/bookings/bookings.service';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';

type StaffSession = { cookie: string; csrfToken: string };
type BookingFixture = { reference: string; checkIn: string; guestPhone: string };
type StaffBookingItem = {
  reference: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomQuantity: number;
  guestName: string;
  guestPhone: string;
  roomType: { slug: string; name: string };
  createdAt: string;
};
type StaffBookingDetail = StaffBookingItem & {
  id: string;
  guestEmail: string | null;
  totalPriceToman: string;
  internalNote: string | null;
  cancellationReason: string | null;
  nights: Array<{
    stayDate: string;
    nightlyPriceToman: string;
    roomQuantity: number;
    amountToman: string;
  }>;
};
type StaffBookingList = {
  items: StaffBookingItem[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};
type StaffApiError = {
  code?: string;
  fields?: Array<{ field: string; messages: string[] }>;
};

function bodyOf<T>(response: { body: unknown }): T {
  if (typeof response.body !== 'object' || response.body === null) {
    throw new Error('The API response body was not an object.');
  }
  return response.body as T;
}

function csrfTokenFrom(response: { body: unknown }): string {
  const body = bodyOf<{ csrfToken?: unknown }>(response);
  if (typeof body.csrfToken !== 'string') {
    throw new Error('Staff login did not return a CSRF token.');
  }
  return body.csrfToken;
}

describe('Staff bookings API (e2e)', () => {
  const suffix = randomUUID();
  const hotelId = randomUUID();
  const adminId = randomUUID();
  const receptionistId = randomUUID();
  const listFixtures: BookingFixture[] = [];
  const actionFixtures: {
    pendingConfirm: BookingFixture;
    pendingReject: BookingFixture;
    pendingCancel: BookingFixture;
    confirmedCancel: BookingFixture;
    rejected: BookingFixture;
  } = {
    pendingConfirm: { reference: '', checkIn: '', guestPhone: '' },
    pendingReject: { reference: '', checkIn: '', guestPhone: '' },
    pendingCancel: { reference: '', checkIn: '', guestPhone: '' },
    confirmedCancel: { reference: '', checkIn: '', guestPhone: '' },
    rejected: { reference: '', checkIn: '', guestPhone: '' },
  };
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let bookings: BookingsService;
  let roomTypeId: string | undefined;
  let roomTypeSlug: string;
  let admin: StaffSession;
  let receptionist: StaffSession;

  async function signIn(email: string, password: string): Promise<StaffSession> {
    const login = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password })
      .expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    return {
      cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
      csrfToken: csrfTokenFrom(login),
    };
  }

  async function createStaffUser(
    id: string,
    role: 'ADMIN' | 'RECEPTIONIST',
  ): Promise<StaffSession> {
    const email = `hbe011-${role.toLowerCase()}-${suffix}@example.invalid`;
    const password = `hbe011-${role.toLowerCase()}-test-password`;
    await prisma.staffUser.create({
      data: {
        id,
        username: `hbe011-${role.toLowerCase()}-${suffix}`,
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        role,
      },
    });
    return signIn(email, password);
  }

  async function createBookingFixture(
    index: number,
    phoneGroup: 'list' | 'actions',
  ): Promise<BookingFixture> {
    const checkIn = addDays(getHotelBusinessDate(), 12 + index * 2);
    const checkOut = addDays(checkIn, 1);
    const guestPhone =
      phoneGroup === 'list'
        ? `+989123${String(index).padStart(6, '0')}`
        : `+989155${String(index).padStart(6, '0')}`;
    const booking = await bookings.create(
      {
        roomTypeSlug,
        checkIn,
        checkOut,
        guestCount: 1,
        roomQuantity: 1,
        guestName: `HBE-011 Fictional Guest ${phoneGroup} ${index}`,
        guestPhone,
        guestEmail: `hbe011-${phoneGroup}-${index}-${suffix}@example.invalid`,
      },
      `hbe011-e2e-${randomUUID()}`,
    );
    return { reference: booking.reference, checkIn, guestPhone };
  }

  async function setCreatedAt(reference: string, offsetMinutes: number): Promise<void> {
    await prisma.booking.update({
      where: { publicReference: reference },
      data: { createdAt: new Date(Date.UTC(2026, 10, 14, 8, offsetMinutes)) },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    bookings = app.get(BookingsService);

    await prisma.hotel.create({
      data: {
        id: hotelId,
        slug: `hbe011-${suffix}`,
        name: 'HBE-011 fictional test hotel',
        address: 'Fictional test address',
        description: 'Fictional data for the staff bookings API tests.',
      },
    });
    const roomType = await prisma.roomType.create({
      data: {
        hotelId,
        slug: `hbe011-${suffix}`,
        name: 'HBE-011 fictional test room',
        description: 'Fictional room for API tests.',
        maxGuestsPerRoom: 2,
      },
    });
    roomTypeId = roomType.id;
    roomTypeSlug = roomType.slug;
    const inventoryStart = addDays(getHotelBusinessDate(), 10);
    await prisma.roomNightInventory.createMany({
      data: Array.from({ length: 40 }, (_, index) => ({
        roomTypeId: roomType.id,
        stayDate: new Date(`${addDays(inventoryStart, index)}T00:00:00.000Z`),
        totalRooms: 20,
        heldRooms: 0,
        bookedRooms: 0,
        nightlyPriceToman: 1_250_000n,
      })),
    });

    admin = await createStaffUser(adminId, 'ADMIN');
    receptionist = await createStaffUser(receptionistId, 'RECEPTIONIST');

    for (let index = 0; index < 5; index += 1) {
      const fixture = await createBookingFixture(index, 'list');
      listFixtures.push(fixture);
      await setCreatedAt(fixture.reference, index);
      if (index === 1) {
        await bookings.transition(fixture.reference, 'CONFIRM', {
          internalNote: 'HBE-011 internal confirmation fixture.',
        });
      } else if (index === 2) {
        await bookings.transition(fixture.reference, 'REJECT', {
          internalNote: 'HBE-011 internal rejection fixture.',
        });
      } else if (index === 3) {
        await bookings.transition(fixture.reference, 'CANCEL');
      }
    }

    actionFixtures.pendingConfirm = await createBookingFixture(10, 'actions');
    actionFixtures.pendingReject = await createBookingFixture(11, 'actions');
    actionFixtures.pendingCancel = await createBookingFixture(12, 'actions');
    actionFixtures.confirmedCancel = await createBookingFixture(13, 'actions');
    actionFixtures.rejected = await createBookingFixture(14, 'actions');
    await bookings.transition(actionFixtures.confirmedCancel.reference, 'CONFIRM');
    await bookings.transition(actionFixtures.rejected.reference, 'REJECT');
  }, 30000);

  afterAll(async () => {
    if (prisma && roomTypeId) {
      await prisma.booking.deleteMany({ where: { roomTypeId } });
      await prisma.roomNightInventory.deleteMany({ where: { roomTypeId } });
      await prisma.staffSession.deleteMany({
        where: { staffUserId: { in: [adminId, receptionistId] } },
      });
      await prisma.staffUser.updateMany({
        where: { id: { in: [adminId, receptionistId] } },
        data: { isActive: false },
      });
      await prisma.roomType.deleteMany({ where: { id: roomTypeId } });
      await prisma.hotel.deleteMany({ where: { id: hotelId } });
    }
    await app?.close();
  });

  it('requires staff authentication for list and detail endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/staff/bookings').expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/staff/bookings/${listFixtures[0].reference}`)
      .expect(401);
  });

  it('returns deterministic pagination with only the staff list fields', async () => {
    const pageOne = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', admin.cookie)
      .query({ search: '۰۹۱۲۳', page: 1, pageSize: 2 })
      .expect(200);
    const pageTwo = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', admin.cookie)
      .query({ search: '۰۹۱۲۳', page: 2, pageSize: 2 })
      .expect(200);
    const pageThree = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', admin.cookie)
      .query({ search: '۰۹۱۲۳', page: 3, pageSize: 2 })
      .expect(200);
    const first = bodyOf<StaffBookingList>(pageOne);
    const second = bodyOf<StaffBookingList>(pageTwo);
    const third = bodyOf<StaffBookingList>(pageThree);

    expect(first.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 5, totalPages: 3 });
    expect(first.items.map((item) => item.reference)).toEqual([
      listFixtures[4].reference,
      listFixtures[3].reference,
    ]);
    expect(second.items.map((item) => item.reference)).toEqual([
      listFixtures[2].reference,
      listFixtures[1].reference,
    ]);
    expect(third.items.map((item) => item.reference)).toEqual([listFixtures[0].reference]);
    expect(first.items[0]).not.toHaveProperty('id');
    expect(first.items[0]).not.toHaveProperty('guestEmail');
    expect(first.items[0]).not.toHaveProperty('internalNote');
    expect(first.items[0]).not.toHaveProperty('cancellationReason');
  });

  it('filters by status and inclusive arrival-date bounds', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', receptionist.cookie)
      .query({
        status: 'PENDING_CONFIRMATION',
        arrivalFrom: listFixtures[0].checkIn,
        arrivalTo: listFixtures[4].checkIn,
        search: '09123',
        page: 1,
        pageSize: 20,
      })
      .expect(200);
    const result = bodyOf<StaffBookingList>(response);

    expect(result.items.map((item) => item.reference)).toEqual([
      listFixtures[4].reference,
      listFixtures[0].reference,
    ]);
    expect(result.items.every((item) => item.status === 'PENDING_CONFIRMATION')).toBe(true);
  });

  it('searches by exact public reference and normalized phone', async () => {
    const referenceResult = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', admin.cookie)
      .query({ search: listFixtures[2].reference })
      .expect(200);
    const phoneResult = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', admin.cookie)
      .query({ search: '09123000002' })
      .expect(200);

    expect(bodyOf<StaffBookingList>(referenceResult).items.map((item) => item.reference)).toEqual([
      listFixtures[2].reference,
    ]);
    expect(bodyOf<StaffBookingList>(phoneResult).items.map((item) => item.reference)).toEqual([
      listFixtures[2].reference,
    ]);
  });

  it('returns guest details only in the authenticated staff detail view', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/staff/bookings/${listFixtures[1].reference}`)
      .set('Cookie', receptionist.cookie)
      .expect(200);
    const detail = bodyOf<StaffBookingDetail>(response);

    expect(detail).toMatchObject({
      reference: listFixtures[1].reference,
      status: 'CONFIRMED',
      guestName: 'HBE-011 Fictional Guest list 1',
      guestEmail: `hbe011-list-1-${suffix}@example.invalid`,
      internalNote: 'HBE-011 internal confirmation fixture.',
    });
    expect(detail.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(detail).not.toHaveProperty('idempotencyKey');
    expect(detail).not.toHaveProperty('idempotencyRequestHash');
    expect(detail).not.toHaveProperty('roomTypeId');
  });

  it('rejects invalid pagination, dates, and unknown query fields', async () => {
    const invalidPage = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', admin.cookie)
      .query({ page: 0 })
      .expect(400);
    const invalidDates = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', admin.cookie)
      .query({ arrivalFrom: '2027-02-31' })
      .expect(400);
    const unknownField = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', admin.cookie)
      .query({ guestEmail: 'guest@example.invalid' })
      .expect(400);

    expect(bodyOf<StaffApiError>(invalidPage).code).toBe('VALIDATION_ERROR');
    expect(bodyOf<StaffApiError>(invalidDates).code).toBe('INVALID_DATE_RANGE');
    expect(bodyOf<StaffApiError>(unknownField).code).toBe('VALIDATION_ERROR');
  });

  it('requires CSRF proof and lets a receptionist confirm a pending booking', async () => {
    const noCsrf = await request(app.getHttpServer())
      .post(`/api/v1/staff/bookings/${actionFixtures.pendingConfirm.reference}/confirm`)
      .set('Cookie', receptionist.cookie)
      .send({ internalNote: 'Should not be saved.' })
      .expect(403);
    expect(bodyOf<StaffApiError>(noCsrf).code).toBe('FORBIDDEN');

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/staff/bookings/${actionFixtures.pendingConfirm.reference}/confirm`)
      .set('Cookie', receptionist.cookie)
      .set('X-CSRF-Token', receptionist.csrfToken)
      .send({ internalNote: 'Receptionist confirmation note.' })
      .expect(200);
    const repeated = await request(app.getHttpServer())
      .post(`/api/v1/staff/bookings/${actionFixtures.pendingConfirm.reference}/confirm`)
      .set('Cookie', receptionist.cookie)
      .set('X-CSRF-Token', receptionist.csrfToken)
      .send({})
      .expect(200);
    const detail = bodyOf<StaffBookingDetail>(confirmed);
    const retry = bodyOf<StaffBookingDetail>(repeated);

    expect(detail.status).toBe('CONFIRMED');
    expect(detail.internalNote).toBe('Receptionist confirmation note.');
    expect(retry.status).toBe('CONFIRMED');
    expect(retry.internalNote).toBe('Receptionist confirmation note.');
    const bookingRow = await prisma.booking.findUniqueOrThrow({
      where: { publicReference: actionFixtures.pendingConfirm.reference },
      select: { id: true },
    });
    const confirmationAudit = await prisma.auditEvent.findFirst({
      where: { targetId: bookingRow.id, eventName: 'BOOKING_CONFIRM' },
    });
    expect(confirmationAudit).toMatchObject({
      actorStaffUserId: receptionistId,
      targetType: 'BOOKING',
      before: { status: 'PENDING_CONFIRMATION' },
      after: { status: 'CONFIRMED' },
    });
    expect(JSON.stringify(confirmationAudit)).not.toContain('HBE-011 Fictional Guest');
    const counters = await prisma.roomNightInventory.findMany({
      where: { roomTypeId },
      orderBy: { stayDate: 'asc' },
      select: { stayDate: true, heldRooms: true, bookedRooms: true },
    });
    const bookingNight = counters.find(
      (night) =>
        night.stayDate.toISOString().slice(0, 10) === actionFixtures.pendingConfirm.checkIn,
    );
    expect(bookingNight).toMatchObject({ heldRooms: 0, bookedRooms: 1 });
  });

  it('lets an admin reject a pending booking with an optional internal note', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/staff/bookings/${actionFixtures.pendingReject.reference}/reject`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ internalNote: 'Inventory could not be confirmed.' })
      .expect(200);
    const detail = bodyOf<StaffBookingDetail>(response);

    expect(detail.status).toBe('REJECTED');
    expect(detail.internalNote).toBe('Inventory could not be confirmed.');
  });

  it('lets staff cancel a pending booking without a confirmed-booking reason', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/staff/bookings/${actionFixtures.pendingCancel.reference}/cancel`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({})
      .expect(200);

    expect(bodyOf<StaffBookingDetail>(response)).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: null,
    });
  });

  it('requires a reason to cancel a confirmed booking and returns the latest state', async () => {
    const missingReason = await request(app.getHttpServer())
      .post(`/api/v1/staff/bookings/${actionFixtures.confirmedCancel.reference}/cancel`)
      .set('Cookie', receptionist.cookie)
      .set('X-CSRF-Token', receptionist.csrfToken)
      .send({})
      .expect(400);
    expect(bodyOf<StaffApiError>(missingReason).code).toBe('CANCELLATION_REASON_REQUIRED');

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/staff/bookings/${actionFixtures.confirmedCancel.reference}/cancel`)
      .set('Cookie', receptionist.cookie)
      .set('X-CSRF-Token', receptionist.csrfToken)
      .send({ reason: 'Guest requested cancellation.' })
      .expect(200);
    const detail = bodyOf<StaffBookingDetail>(cancelled);

    expect(detail.status).toBe('CANCELLED');
    expect(detail.cancellationReason).toBe('Guest requested cancellation.');
  });

  it('returns a conflict for an invalid terminal-status action', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/staff/bookings/${actionFixtures.rejected.reference}/cancel`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ reason: 'This transition is not allowed.' })
      .expect(409);

    expect(bodyOf<StaffApiError>(response).code).toBe('BOOKING_STATUS_CONFLICT');
  });
});
