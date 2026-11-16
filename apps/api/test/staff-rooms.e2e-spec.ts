import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';

type ApiError = { code?: string; message?: string; fields?: unknown };
type RoomApiResponse = {
  id: string;
  roomNumber: string;
  floor: string | null;
  features: string[];
  housekeepingStatus: string;
  isActive: boolean;
  isGenerated: boolean;
};
type RoomsApiResponse = { items: RoomApiResponse[] };
type InventoryApiResponse = {
  nights: Array<{
    stayDate: string;
    capacitySource: 'PROJECTED' | 'HISTORICAL' | 'UNAVAILABLE';
    totalRooms: number | null;
    heldRooms: number | null;
    bookedRooms: number | null;
    blockedRooms: number | null;
    availableRooms: number | null;
    nightlyPriceToman: string | null;
  }>;
};

function errorBody(response: { body: unknown }): ApiError {
  return typeof response.body === 'object' && response.body !== null ? response.body : {};
}

function bodyAs<T>(response: { body: unknown }): T {
  if (typeof response.body !== 'object' || response.body === null) {
    throw new Error('API response body was not an object.');
  }
  return response.body as T;
}

function csrfTokenFrom(response: { body: unknown }): string {
  if (typeof response.body !== 'object' || response.body === null) {
    throw new Error('Staff login did not return a response object.');
  }
  const csrfToken = (response.body as Record<string, unknown>).csrfToken;
  if (typeof csrfToken !== 'string') throw new Error('Staff login did not return a CSRF token.');
  return csrfToken;
}

function propertyDate(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return new Date(
    Date.UTC(
      Number(values.get('year')),
      Number(values.get('month')) - 1,
      Number(values.get('day')),
    ),
  );
}

describe('Staff physical room API (e2e)', () => {
  const suffix = randomUUID();
  const hotelId = randomUUID();
  const adminId = randomUUID();
  const managerId = randomUUID();
  const receptionistId = randomUUID();
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let physicalSchemaAvailable = false;
  let roomTypeId: string;
  let admin: { cookie: string; csrfToken: string };
  let manager: { cookie: string; csrfToken: string };
  let receptionist: { cookie: string; csrfToken: string };

  async function signIn(email: string, password: string) {
    const login = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password })
      .expect(200);
    return {
      cookie: (login.headers['set-cookie'] as unknown as string[])
        .map((cookie) => cookie.split(';')[0])
        .join('; '),
      csrfToken: csrfTokenFrom(login),
    };
  }

  async function createStaffUser(id: string, role: 'ADMIN' | 'MANAGER' | 'RECEPTIONIST') {
    const email = `rooms-${role.toLowerCase()}-${suffix}@example.invalid`;
    const password = `rooms-${role.toLowerCase()}-e2e-password`;
    await prisma.staffUser.create({
      data: {
        id,
        username: `rooms-${role.toLowerCase()}-${suffix}`,
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        role,
      },
    });
    return signIn(email, password);
  }

  async function cleanFixtures(): Promise<void> {
    if (!prisma || !physicalSchemaAvailable) return;
    await prisma.$executeRaw`DELETE FROM "room_assignments" WHERE "booking_id" IN (SELECT id FROM bookings WHERE room_type_id = ${roomTypeId}::uuid)`;
    await prisma.$executeRaw`DELETE FROM "room_blocks" WHERE "room_id" IN (SELECT id FROM rooms WHERE "room_type_id" = ${roomTypeId}::uuid)`;
    await prisma.$executeRaw`DELETE FROM "rooms" WHERE "room_type_id" = ${roomTypeId}::uuid`;
    await prisma.roomNightInventory.deleteMany({ where: { roomTypeId } });
    await prisma.booking.deleteMany({ where: { roomTypeId } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    const schema = await prisma.$queryRaw<Array<{ available: boolean }>>`
      SELECT to_regclass('public.rooms') IS NOT NULL AS available
    `;
    physicalSchemaAvailable = schema[0]?.available ?? false;

    await prisma.hotel.create({
      data: {
        id: hotelId,
        slug: `rooms-${suffix}`,
        name: 'Physical rooms fixture hotel',
        address: 'Fictional test address',
        description: 'Fictional API test hotel.',
      },
    });
    const roomType = await prisma.roomType.create({
      data: {
        hotelId,
        slug: `rooms-${suffix}`,
        name: 'Physical rooms fixture type',
        description: 'Fictional API test room type.',
        maxGuestsPerRoom: 4,
      },
    });
    roomTypeId = roomType.id;
    admin = await createStaffUser(adminId, 'ADMIN');
    manager = await createStaffUser(managerId, 'MANAGER');
    receptionist = await createStaffUser(receptionistId, 'RECEPTIONIST');
  }, 30000);

  afterEach(async () => cleanFixtures());

  afterAll(async () => {
    if (prisma) {
      await cleanFixtures();
      await prisma.staffSession.deleteMany({
        where: { staffUserId: { in: [adminId, managerId, receptionistId] } },
      });
      await prisma.staffUser.updateMany({
        where: { id: { in: [adminId, managerId, receptionistId] } },
        data: { isActive: false },
      });
      await prisma.roomType.deleteMany({ where: { id: roomTypeId } });
      await prisma.hotel.deleteMany({ where: { id: hotelId } });
    }
    await app?.close();
  });

  it('creates, edits, and filters physical rooms using stable public fields', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/staff/rooms')
      .set('Cookie', manager.cookie)
      .set('X-CSRF-Token', manager.csrfToken)
      .expect('Cache-Control', 'private, no-store')
      .send({ roomTypeId, roomNumber: '201', floor: '2', features: ['balcony'] })
      .expect(201);
    const createdRoom = bodyAs<RoomApiResponse>(created);

    expect(createdRoom).toMatchObject({
      roomNumber: '201',
      floor: '2',
      features: ['balcony'],
      isActive: true,
      housekeepingStatus: 'DIRTY',
      isGenerated: false,
    });
    const roomId = createdRoom.id;
    const creationAudit = await prisma.auditEvent.findFirst({
      where: { eventName: 'ROOM_CREATED', targetId: roomId },
    });
    expect(creationAudit).toMatchObject({
      actorStaffUserId: managerId,
      targetType: 'ROOM',
      after: { roomNumber: '201', isActive: true },
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/staff/rooms/${roomId}`)
      .set('Cookie', manager.cookie)
      .set('X-CSRF-Token', manager.csrfToken)
      .expect('Cache-Control', 'private, no-store')
      .send({ floor: '3', features: ['balcony', 'city-view'] })
      .expect(200);
    expect(bodyAs<RoomApiResponse>(updated)).toMatchObject({
      roomNumber: '201',
      floor: '3',
      features: ['balcony', 'city-view'],
    });

    const listed = await request(app.getHttpServer())
      .get('/api/v1/staff/rooms')
      .set('Cookie', manager.cookie)
      .query({ roomTypeId, floor: '3', isActive: 'true', search: '201' })
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    const listedRooms = bodyAs<RoomsApiResponse>(listed).items;
    expect(listedRooms).toHaveLength(1);
    expect(listedRooms[0]).toMatchObject({ id: roomId, roomNumber: '201', floor: '3' });

    const receptionistBoard = await request(app.getHttpServer())
      .get('/api/v1/staff/rooms')
      .set('Cookie', receptionist.cookie)
      .query({ search: '201' })
      .expect(200);
    expect(bodyAs<RoomsApiResponse>(receptionistBoard).items[0].id).toBe(roomId);

    await request(app.getHttpServer())
      .get('/api/v1/staff/inventory/room-types')
      .set('Cookie', manager.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/staff/inventory/room-types')
      .set('Cookie', receptionist.cookie)
      .expect(403);
  });

  it('rejects duplicate room numbers within the property', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/staff/rooms')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ roomTypeId, roomNumber: '202' })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/staff/rooms')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ roomTypeId, roomNumber: '202' })
      .expect(409);

    expect(bodyAs<RoomApiResponse>(first).roomNumber).toBe('202');
    expect(errorBody(duplicate).code).toBe('ROOM_NUMBER_TAKEN');
  });

  it('replaces generated room numbers and clears the generated marker', async () => {
    const generated = await prisma.room.create({
      data: {
        hotelId,
        roomTypeId,
        roomNumber: `GEN-${suffix.slice(0, 8)}-0000000001`,
        isGenerated: true,
        housekeepingStatus: 'INSPECTED',
      },
    });
    const generatedList = await request(app.getHttpServer())
      .get('/api/v1/staff/rooms')
      .set('Cookie', admin.cookie)
      .query({ search: generated.roomNumber })
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(bodyAs<RoomsApiResponse>(generatedList).items[0].isGenerated).toBe(true);

    const unchanged = await request(app.getHttpServer())
      .patch(`/api/v1/staff/rooms/${generated.id}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ roomNumber: generated.roomNumber })
      .expect(200);
    expect(bodyAs<RoomApiResponse>(unchanged)).toMatchObject({
      roomNumber: generated.roomNumber,
      isGenerated: true,
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/staff/rooms/${generated.id}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect('Cache-Control', 'private, no-store')
      .send({ roomNumber: '301' })
      .expect(200);

    expect(bodyAs<RoomApiResponse>(updated)).toMatchObject({
      roomNumber: '301',
      isGenerated: false,
    });
  });

  it.each([
    ['roomNumber', { roomNumber: null }],
    ['features', { features: null }],
  ])('rejects null PATCH values for %s without a server error', async (_field, body) => {
    const room = await prisma.room.create({
      data: { hotelId, roomTypeId, roomNumber: `NULL-${suffix.slice(0, 6)}-${_field}` },
    });
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/staff/rooms/${room.id}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send(body)
      .expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate room number when renumbering an existing room', async () => {
    const first = await prisma.room.create({
      data: { hotelId, roomTypeId, roomNumber: '302' },
    });
    const second = await prisma.room.create({
      data: { hotelId, roomTypeId, roomNumber: '303' },
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/staff/rooms/${second.id}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ roomNumber: first.roomNumber })
      .expect(409);

    expect(errorBody(response).code).toBe('ROOM_NUMBER_TAKEN');
  });

  it('rejects room management for non-admin staff and without CSRF proof', async () => {
    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/staff/rooms')
      .set('Cookie', receptionist.cookie)
      .set('X-CSRF-Token', receptionist.csrfToken)
      .send({ roomTypeId, roomNumber: '203' })
      .expect(403);
    expect(errorBody(forbidden).code).toBe('FORBIDDEN');

    await request(app.getHttpServer())
      .post('/api/v1/staff/rooms')
      .set('Cookie', admin.cookie)
      .send({ roomTypeId, roomNumber: '204' })
      .expect(403);
  });

  it('rejects deactivation when a current or future active room assignment overlaps', async () => {
    const room = await request(app.getHttpServer())
      .post('/api/v1/staff/rooms')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ roomTypeId, roomNumber: '205' })
      .expect(201);
    const roomId = bodyAs<RoomApiResponse>(room).id;
    const booking = await prisma.booking.create({
      data: {
        publicReference: `RM${suffix.slice(0, 10)}`,
        status: 'CONFIRMED',
        checkIn: new Date('2027-06-10T00:00:00.000Z'),
        checkOut: new Date('2027-06-12T00:00:00.000Z'),
        guestCount: 2,
        roomTypeId,
        roomQuantity: 1,
        guestName: 'Fictional Assigned Guest',
        guestPhone: '+989121234567',
        totalPriceToman: 100n,
        expiresAt: new Date('2027-06-01T00:00:00.000Z'),
      },
    });
    await prisma.$executeRaw`
      INSERT INTO "room_assignments" ("id", "booking_id", "room_id", "room_type_id", "start_date", "end_date", "is_active", "created_at", "updated_at")
      VALUES (${randomUUID()}::uuid, ${booking.id}::uuid, ${roomId}::uuid, ${roomTypeId}::uuid, DATE '2027-06-10', DATE '2027-06-12', true, now(), now())
    `;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/staff/rooms/${roomId}/deactivate`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(409);

    expect(errorBody(response).code).toBe('ROOM_HAS_ACTIVE_ASSIGNMENTS');
    const persisted = await prisma.$queryRaw<Array<{ is_active: boolean }>>`
      SELECT "is_active" FROM "rooms" WHERE id = ${roomId}::uuid
    `;
    expect(persisted[0].is_active).toBe(true);
  }, 30000);

  it('keeps a room assigned through its checkout business date until checkout clears it', async () => {
    const room = await prisma.room.create({
      data: { hotelId, roomTypeId, roomNumber: 'CHECKOUT-TODAY' },
    });
    const today = propertyDate('Asia/Tehran');
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const booking = await prisma.booking.create({
      data: {
        publicReference: `TD${suffix.slice(0, 12)}`,
        status: 'CONFIRMED',
        checkIn: yesterday,
        checkOut: today,
        guestCount: 1,
        roomTypeId,
        roomQuantity: 1,
        guestName: 'Fictional Checkout Guest',
        guestPhone: '+989121234567',
        totalPriceToman: 100n,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const assignment = await prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomId: room.id,
        roomTypeId,
        startDate: yesterday,
        endDate: today,
        isActive: true,
      },
    });

    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/staff/rooms/${room.id}/deactivate`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(409);
    expect(errorBody(blocked).code).toBe('ROOM_HAS_ACTIVE_ASSIGNMENTS');

    await prisma.roomAssignment.update({
      where: { id: assignment.id },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/staff/rooms/${room.id}/deactivate`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200);
  }, 30000);

  it('deactivates against current and future capacity without changing booked history', async () => {
    const rooms = await Promise.all(
      ['HIST-1', 'HIST-2', 'HIST-3'].map((roomNumber) =>
        prisma.room.create({ data: { hotelId, roomTypeId, roomNumber } }),
      ),
    );
    const pastDate = new Date('2020-01-10T00:00:00.000Z');
    await prisma.roomBlock.create({
      data: {
        roomId: rooms[2].id,
        startDate: pastDate,
        endDate: new Date('2020-01-11T00:00:00.000Z'),
        reason: 'Fictional historical block',
      },
    });
    await prisma.roomNightInventory.create({
      data: {
        roomTypeId,
        stayDate: pastDate,
        totalRooms: 2,
        blockedRooms: 1,
        heldRooms: 0,
        bookedRooms: 2,
        nightlyPriceToman: 3500n,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/staff/rooms/${rooms[0].id}/deactivate`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200);

    const historic = await prisma.roomNightInventory.findUniqueOrThrow({
      where: { roomTypeId_stayDate: { roomTypeId, stayDate: pastDate } },
    });
    expect(historic).toMatchObject({
      totalRooms: 2,
      blockedRooms: 1,
      bookedRooms: 2,
      nightlyPriceToman: 3500n,
    });

    const historical = await request(app.getHttpServer())
      .get('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .query({ roomTypeId, startDate: '2020-01-10', endDate: '2020-01-11' })
      .expect(200);
    expect(bodyAs<InventoryApiResponse>(historical).nights[0]).toMatchObject({
      capacitySource: 'HISTORICAL',
      totalRooms: 2,
      blockedRooms: 1,
      bookedRooms: 2,
      availableRooms: 0,
    });
  }, 30000);

  it('returns projected capacity and zero counters even when no rate row exists', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/staff/rooms')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ roomTypeId, roomNumber: '206' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/staff/rooms')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ roomTypeId, roomNumber: '207' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .query({ roomTypeId, startDate: '2027-07-01', endDate: '2027-07-02' })
      .expect('Cache-Control', 'private, no-store')
      .expect(200);

    expect(bodyAs<InventoryApiResponse>(response).nights).toEqual([
      {
        stayDate: '2027-07-01',
        capacitySource: 'PROJECTED',
        totalRooms: 2,
        heldRooms: 0,
        bookedRooms: 0,
        blockedRooms: 0,
        availableRooms: 2,
        nightlyPriceToman: null,
      },
    ]);
  });

  it('deactivates and reactivates a room with a projection round trip and retained rate', async () => {
    const room = await prisma.room.create({
      data: { hotelId, roomTypeId, roomNumber: '216' },
    });
    await prisma.roomNightInventory.create({
      data: {
        roomTypeId,
        stayDate: new Date('2027-07-05T00:00:00.000Z'),
        totalRooms: 1,
        heldRooms: 0,
        bookedRooms: 0,
        nightlyPriceToman: 4200n,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/staff/rooms/${room.id}/deactivate`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    const inactiveInventory = await prisma.roomNightInventory.findUniqueOrThrow({
      where: {
        roomTypeId_stayDate: { roomTypeId, stayDate: new Date('2027-07-05T00:00:00.000Z') },
      },
    });
    expect(inactiveInventory.totalRooms).toBe(0);

    const reactivated = await request(app.getHttpServer())
      .post(`/api/v1/staff/rooms/${room.id}/reactivate`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(bodyAs<RoomApiResponse>(reactivated).isActive).toBe(true);
    const activeInventory = await prisma.roomNightInventory.findUniqueOrThrow({
      where: {
        roomTypeId_stayDate: { roomTypeId, stayDate: new Date('2027-07-05T00:00:00.000Z') },
      },
    });
    expect(activeInventory).toMatchObject({ totalRooms: 1, nightlyPriceToman: 4200n });
  }, 30000);

  it('sets only nightly prices and rejects browser-supplied capacity', async () => {
    await Promise.all(
      ['214', '215'].map((roomNumber) =>
        request(app.getHttpServer())
          .post('/api/v1/staff/rooms')
          .set('Cookie', admin.cookie)
          .set('X-CSRF-Token', admin.csrfToken)
          .send({ roomTypeId, roomNumber })
          .expect(201),
      ),
    );
    const response = await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', manager.cookie)
      .set('X-CSRF-Token', manager.csrfToken)
      .expect('Cache-Control', 'private, no-store')
      .send({
        roomTypeId,
        startDate: '2027-07-03',
        endDate: '2027-07-04',
        nightlyPriceToman: '2500',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', receptionist.cookie)
      .set('X-CSRF-Token', receptionist.csrfToken)
      .send({
        roomTypeId,
        startDate: '2027-07-03',
        endDate: '2027-07-04',
        nightlyPriceToman: '2600',
      })
      .expect(403);

    expect(bodyAs<InventoryApiResponse>(response).nights[0]).toMatchObject({
      totalRooms: 2,
      heldRooms: 0,
      bookedRooms: 0,
      blockedRooms: 0,
      availableRooms: 2,
      nightlyPriceToman: '2500',
    });

    const invalid = await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        roomTypeId,
        startDate: '2027-07-03',
        endDate: '2027-07-04',
        totalRooms: 999,
        nightlyPriceToman: '2600',
      })
      .expect(400);
    expect(errorBody(invalid).code).toBe('VALIDATION_ERROR');

    const persisted = await prisma.roomNightInventory.findUniqueOrThrow({
      where: {
        roomTypeId_stayDate: { roomTypeId, stayDate: new Date('2027-07-03T00:00:00.000Z') },
      },
    });
    expect(persisted.totalRooms).toBe(2);
    expect(persisted.nightlyPriceToman).toBe(2500n);
  });

  it('rejects a room-capacity projection below held plus booked reservations', async () => {
    const rooms = await Promise.all(
      ['208', '209', '210'].map((roomNumber) =>
        request(app.getHttpServer())
          .post('/api/v1/staff/rooms')
          .set('Cookie', admin.cookie)
          .set('X-CSRF-Token', admin.csrfToken)
          .send({ roomTypeId, roomNumber })
          .expect(201),
      ),
    );
    await prisma.roomNightInventory.create({
      data: {
        roomTypeId,
        stayDate: new Date('2027-07-10T00:00:00.000Z'),
        totalRooms: rooms.length,
        heldRooms: 1,
        bookedRooms: rooms.length - 1,
        nightlyPriceToman: 1000n,
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/staff/rooms/${bodyAs<RoomApiResponse>(rooms[0]).id}/deactivate`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(409);

    expect(errorBody(response).code).toBe('CAPACITY_BELOW_RESERVED');
    const inventory = await prisma.roomNightInventory.findUniqueOrThrow({
      where: {
        roomTypeId_stayDate: { roomTypeId, stayDate: new Date('2027-07-10T00:00:00.000Z') },
      },
    });
    expect(inventory.totalRooms).toBe(3);
    expect(inventory.heldRooms + inventory.bookedRooms).toBe(3);
  }, 30000);

  it('increases existing nightly projections when an active room is added', async () => {
    await Promise.all(
      ['211', '212'].map((roomNumber) =>
        request(app.getHttpServer())
          .post('/api/v1/staff/rooms')
          .set('Cookie', admin.cookie)
          .set('X-CSRF-Token', admin.csrfToken)
          .send({ roomTypeId, roomNumber })
          .expect(201),
      ),
    );
    await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        roomTypeId,
        startDate: '2027-07-20',
        endDate: '2027-07-21',
        nightlyPriceToman: '3000',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/staff/rooms')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ roomTypeId, roomNumber: '213' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .query({ roomTypeId, startDate: '2027-07-20', endDate: '2027-07-21' })
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(bodyAs<InventoryApiResponse>(response).nights[0]).toMatchObject({
      totalRooms: 3,
      heldRooms: 0,
      bookedRooms: 0,
      blockedRooms: 0,
      availableRooms: 3,
      nightlyPriceToman: '3000',
    });
  });
});
