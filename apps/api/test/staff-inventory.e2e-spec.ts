import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';

type StaffInventoryApiError = {
  code?: string;
  message?: string;
  fields?: unknown;
};

function errorBody(response: { body: unknown }): StaffInventoryApiError {
  if (typeof response.body !== 'object' || response.body === null) {
    return {};
  }
  return response.body;
}

function csrfTokenFrom(response: { body: unknown }): string {
  if (typeof response.body !== 'object' || response.body === null) {
    throw new Error('Staff login did not return a response object.');
  }
  const csrfToken = (response.body as Record<string, unknown>).csrfToken;
  if (typeof csrfToken !== 'string') {
    throw new Error('Staff login did not return a CSRF token.');
  }
  return csrfToken;
}

describe('Staff inventory API (e2e)', () => {
  const suffix = randomUUID();
  const hotelId = randomUUID();
  const adminId = randomUUID();
  const receptionistId = randomUUID();
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let roomTypeId: string;
  let orderedRoomTypeId: string;
  let inactiveRoomTypeId: string;
  let admin: { cookie: string; csrfToken: string };
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

  async function createStaffUser(id: string, role: 'ADMIN' | 'RECEPTIONIST') {
    const email = `inventory-${role.toLowerCase()}-${suffix}@example.invalid`;
    const password = `inventory-${role.toLowerCase()}-e2e-password`;
    await prisma.staffUser.create({
      data: {
        id,
        username: `inventory-${role.toLowerCase()}-${suffix}`,
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        role,
      },
    });
    return signIn(email, password);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.hotel.create({
      data: {
        id: hotelId,
        slug: `inventory-${suffix}`,
        name: 'Inventory fixture hotel',
        address: 'Fictional test address',
        description: 'Fictional API test hotel.',
      },
    });
    const roomType = await prisma.roomType.create({
      data: {
        hotelId,
        slug: `inventory-${suffix}`,
        name: 'Inventory fixture room',
        description: 'Fictional API test room.',
        maxGuestsPerRoom: 4,
        displayOrder: 2,
        isActive: true,
      },
    });
    roomTypeId = roomType.id;
    await prisma.room.createMany({
      data: ['101', '102', '103'].map((roomNumber) => ({
        hotelId,
        roomTypeId,
        roomNumber,
        housekeepingStatus: 'INSPECTED',
      })),
    });
    const orderedRoomType = await prisma.roomType.create({
      data: {
        hotelId,
        slug: `inventory-first-${suffix}`,
        name: 'Inventory fixture first room',
        description: 'Fictional API test room.',
        maxGuestsPerRoom: 4,
        displayOrder: 1,
        isActive: true,
      },
    });
    orderedRoomTypeId = orderedRoomType.id;
    const inactiveRoomType = await prisma.roomType.create({
      data: {
        hotelId,
        slug: `inventory-inactive-${suffix}`,
        name: 'Inventory fixture inactive room',
        description: 'Fictional API test room.',
        maxGuestsPerRoom: 4,
        displayOrder: 0,
        isActive: false,
      },
    });
    inactiveRoomTypeId = inactiveRoomType.id;
    admin = await createStaffUser(adminId, 'ADMIN');
    receptionist = await createStaffUser(receptionistId, 'RECEPTIONIST');
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      await prisma.roomAssignment.deleteMany({ where: { booking: { roomTypeId } } });
      await prisma.roomBlock.deleteMany({ where: { room: { roomTypeId } } });
      await prisma.room.deleteMany({ where: { roomTypeId } });
      await prisma.roomNightInventory.deleteMany({
        where: { roomTypeId },
      });
      await prisma.booking.deleteMany({ where: { roomTypeId } });
      await prisma.staffSession.deleteMany({
        where: { staffUserId: { in: [adminId, receptionistId] } },
      });
      await prisma.staffUser.deleteMany({ where: { id: { in: [adminId, receptionistId] } } });
      await prisma.roomType.deleteMany({ where: { hotelId } });
      await prisma.hotel.deleteMany({ where: { id: hotelId } });
    }
    await app?.close();
  });

  it('lets an admin batch set and read capacity and nightly prices for a date range', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect('Cache-Control', 'private, no-store')
      .send({
        roomTypeId,
        startDate: '2027-01-02',
        endDate: '2027-01-04',
        nightlyPriceToman: '3500000',
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .query({ roomTypeId, startDate: '2027-01-02', endDate: '2027-01-04' })
      .expect('Cache-Control', 'private, no-store')
      .expect(200);

    expect(response.body).toMatchObject({
      roomType: { id: roomTypeId, name: 'Inventory fixture room' },
      startDate: '2027-01-02',
      endDate: '2027-01-04',
      nights: [
        {
          stayDate: '2027-01-02',
          totalRooms: 3,
          heldRooms: 0,
          bookedRooms: 0,
          blockedRooms: 0,
          availableRooms: 3,
          nightlyPriceToman: '3500000',
        },
        {
          stayDate: '2027-01-03',
          totalRooms: 3,
          heldRooms: 0,
          bookedRooms: 0,
          blockedRooms: 0,
          availableRooms: 3,
          nightlyPriceToman: '3500000',
        },
      ],
    });
  }, 30000);

  it('requires staff authentication to read inventory', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/staff/inventory')
      .query({ roomTypeId, startDate: '2027-01-02', endDate: '2027-01-04' })
      .expect(401);
  });

  it('lists active and inactive room type options for admins with a stable order and safe fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/staff/inventory/room-types')
      .set('Cookie', admin.cookie)
      .expect(200);

    const options = response.body as Array<Record<string, unknown>>;
    const orderedIndex = options.findIndex((option) => option.id === orderedRoomTypeId);
    const roomIndex = options.findIndex((option) => option.id === roomTypeId);
    const inactiveRoomType = options.find((option) => option.id === inactiveRoomTypeId);
    expect(orderedIndex).toBeGreaterThanOrEqual(0);
    expect(roomIndex).toBeGreaterThan(orderedIndex);
    expect(inactiveRoomType).toMatchObject({ id: inactiveRoomTypeId, isActive: false });
    expect(options[orderedIndex]).toEqual({
      id: orderedRoomTypeId,
      name: 'Inventory fixture first room',
      slug: `inventory-first-${suffix}`,
      isActive: true,
    });
    expect(
      options.every((option) => Object.keys(option).sort().join(',') === 'id,isActive,name,slug'),
    ).toBe(true);
  });

  it('forbids receptionists from listing room type edit targets', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/staff/inventory/room-types')
      .set('Cookie', receptionist.cookie)
      .expect(403);

    expect(errorBody(response).code).toBe('FORBIDDEN');
  });

  it('requires authentication to list room type edit targets', async () => {
    await request(app.getHttpServer()).get('/api/v1/staff/inventory/room-types').expect(401);
  });

  it('requires CSRF proof for inventory mutations', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .send({
        roomTypeId,
        startDate: '2027-01-02',
        endDate: '2027-01-04',
        nightlyPriceToman: '3500000',
      })
      .expect(403);

    expect(errorBody(response).code).toBe('FORBIDDEN');
  });

  it('restricts inventory reads and mutations to administrators', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/staff/inventory')
      .set('Cookie', receptionist.cookie)
      .query({ roomTypeId, startDate: '2027-01-02', endDate: '2027-01-04' })
      .expect(403);

    const response = await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', receptionist.cookie)
      .set('X-CSRF-Token', receptionist.csrfToken)
      .send({
        roomTypeId,
        startDate: '2027-01-02',
        endDate: '2027-01-04',
        nightlyPriceToman: '3500000',
      })
      .expect(403);

    expect(errorBody(response).code).toBe('FORBIDDEN');
  });

  it('rejects invalid dates and inventory values with field errors', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        roomTypeId,
        startDate: '2027-02-30',
        endDate: '2027-03-01',
        nightlyPriceToman: '100',
      })
      .expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_ERROR');
    expect(errorBody(response).fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'startDate' })]),
    );
  });

  it('returns field errors for invalid nightly price strings', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        roomTypeId,
        startDate: '2027-02-01',
        endDate: '2027-02-02',
        nightlyPriceToman: '-10',
      })
      .expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_ERROR');
    expect(errorBody(response).fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'nightlyPriceToman' })]),
    );
  });

  it('rejects Toman values outside the database integer range', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        roomTypeId,
        startDate: '2027-03-01',
        endDate: '2027-03-02',
        nightlyPriceToman: '9223372036854775808',
      })
      .expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_ERROR');
    expect(errorBody(response).fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'nightlyPriceToman' })]),
    );
  });

  it('preserves held and booked counters when prices change', async () => {
    const firstDate = new Date('2027-01-10T00:00:00.000Z');
    const secondDate = new Date('2027-01-11T00:00:00.000Z');
    await prisma.roomNightInventory.createMany({
      data: [
        {
          roomTypeId,
          stayDate: firstDate,
          totalRooms: 4,
          heldRooms: 1,
          bookedRooms: 0,
          nightlyPriceToman: 4_000_000n,
        },
        {
          roomTypeId,
          stayDate: secondDate,
          totalRooms: 4,
          heldRooms: 1,
          bookedRooms: 2,
          nightlyPriceToman: 5_000_000n,
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        roomTypeId,
        startDate: '2027-01-10',
        endDate: '2027-01-12',
        nightlyPriceToman: '6000000',
      })
      .expect(200);
    const responseBody = response.body as {
      nights: Array<{ heldRooms: number; bookedRooms: number }>;
    };
    expect(responseBody.nights[0]).toMatchObject({ heldRooms: 1, bookedRooms: 0 });
    const persisted = await prisma.roomNightInventory.findMany({
      where: { roomTypeId, stayDate: { gte: firstDate, lt: new Date('2027-01-12T00:00:00.000Z') } },
      orderBy: { stayDate: 'asc' },
    });
    expect(
      persisted.map((night) => [
        night.totalRooms,
        night.heldRooms,
        night.bookedRooms,
        night.nightlyPriceToman,
      ]),
    ).toEqual([
      [3, 1, 0, 6_000_000n],
      [3, 1, 2, 6_000_000n],
    ]);
  }, 30000);

  it('preserves existing booking price snapshots after a nightly rate edit', async () => {
    const stayDate = new Date('2027-01-20T00:00:00.000Z');
    const checkOut = new Date('2027-01-21T00:00:00.000Z');
    const booking = await prisma.booking.create({
      data: {
        publicReference: `INV${suffix.slice(0, 10)}`,
        checkIn: stayDate,
        checkOut,
        guestCount: 2,
        roomTypeId,
        roomQuantity: 1,
        guestName: 'Fictional Inventory Guest',
        guestPhone: '+989121234567',
        totalPriceToman: 3_000_000n,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      },
    });
    await prisma.bookingNight.create({
      data: {
        bookingId: booking.id,
        stayDate,
        nightlyPriceToman: 3_000_000n,
        roomQuantity: 1,
        amountToman: 3_000_000n,
      },
    });

    await prisma.roomNightInventory.create({
      data: {
        roomTypeId,
        stayDate,
        totalRooms: 3,
        bookedRooms: 1,
        nightlyPriceToman: 3_000_000n,
      },
    });
    await request(app.getHttpServer())
      .put('/api/v1/staff/inventory')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        roomTypeId,
        startDate: '2027-01-20',
        endDate: '2027-01-21',
        nightlyPriceToman: '4500000',
      })
      .expect(200);

    const snapshot = await prisma.bookingNight.findUniqueOrThrow({
      where: { bookingId_stayDate: { bookingId: booking.id, stayDate } },
    });
    const inventory = await prisma.roomNightInventory.findUniqueOrThrow({
      where: { roomTypeId_stayDate: { roomTypeId, stayDate } },
    });
    expect(snapshot.nightlyPriceToman).toBe(3_000_000n);
    expect(inventory.nightlyPriceToman).toBe(4_500_000n);
  }, 30000);
});
