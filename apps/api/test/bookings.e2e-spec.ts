import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { addDays, getHotelBusinessDate } from '../src/availability/date-range';
import { AppModule } from '../src/app.module';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';
import type { BookingResponseDto } from '../src/bookings/dto/booking-response.dto';

type ValidationResponseBody = {
  code: string;
  fields: Array<{ field: string }>;
};

describe('Guest bookings API (e2e)', () => {
  const hotelId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const hotelSlug = `booking-${suffix}`;
  const roomTypeSlug = `${hotelSlug}-garden-suite`;
  const lastRoomTypeSlug = `${hotelSlug}-last-room`;
  const soldOutRoomTypeSlug = `${hotelSlug}-second-night-sold-out`;
  const dates = {
    checkIn: addDays(getHotelBusinessDate(), 7),
    secondNight: addDays(getHotelBusinessDate(), 8),
    checkOut: addDays(getHotelBusinessDate(), 9),
  };
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let roomTypeId: string;
  let lastRoomTypeId: string;
  let soldOutRoomTypeId: string;

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
        slug: hotelSlug,
        name: 'Fictional booking test hotel',
        address: 'Fictional test address',
        description: 'Fictional booking API fixture.',
      },
    });
    const mainRoomType = await createRoomType(roomTypeSlug, 'Garden suite', 2);
    roomTypeId = mainRoomType.id;
    await prisma.roomNightInventory.createMany({
      data: [
        {
          roomTypeId,
          stayDate: new Date(`${dates.checkIn}T00:00:00.000Z`),
          totalRooms: 5,
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: 1_200_000n,
        },
        {
          roomTypeId,
          stayDate: new Date(`${dates.secondNight}T00:00:00.000Z`),
          totalRooms: 5,
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: 2_300_000n,
        },
      ],
    });

    const lastRoomType = await createRoomType(lastRoomTypeSlug, 'Last room suite', 2);
    lastRoomTypeId = lastRoomType.id;
    await prisma.roomNightInventory.createMany({
      data: [dates.checkIn, dates.secondNight].map((stayDate) => ({
        roomTypeId: lastRoomTypeId,
        stayDate: new Date(`${stayDate}T00:00:00.000Z`),
        totalRooms: 1,
        heldRooms: 0,
        bookedRooms: 0,
        nightlyPriceToman: 1_500_000n,
      })),
    });

    const soldOutRoomType = await createRoomType(soldOutRoomTypeSlug, 'Sold out suite', 2);
    soldOutRoomTypeId = soldOutRoomType.id;
    await prisma.roomNightInventory.createMany({
      data: [
        {
          roomTypeId: soldOutRoomTypeId,
          stayDate: new Date(`${dates.checkIn}T00:00:00.000Z`),
          totalRooms: 2,
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: 1_600_000n,
        },
        {
          roomTypeId: soldOutRoomTypeId,
          stayDate: new Date(`${dates.secondNight}T00:00:00.000Z`),
          totalRooms: 1,
          heldRooms: 1,
          bookedRooms: 0,
          nightlyPriceToman: 1_800_000n,
        },
      ],
    });

    async function createRoomType(slug: string, name: string, maxGuestsPerRoom: number) {
      return prisma.roomType.create({
        data: {
          hotelId,
          slug,
          name,
          description: 'Fictional room used by an API test.',
          maxGuestsPerRoom,
          amenities: ['wifi'],
        },
      });
    }
  });

  afterAll(async () => {
    const roomTypeIds = [roomTypeId, lastRoomTypeId, soldOutRoomTypeId].filter((id): id is string =>
      Boolean(id),
    );
    if (prisma && roomTypeIds.length > 0) {
      await prisma.booking.deleteMany({ where: { roomTypeId: { in: roomTypeIds } } });
      await prisma.roomNightInventory.deleteMany({ where: { roomTypeId: { in: roomTypeIds } } });
      await prisma.roomType.deleteMany({ where: { id: { in: roomTypeIds } } });
      await prisma.hotel.deleteMany({ where: { id: hotelId } });
    }
    if (app) {
      await app.close();
    }
  });

  it('creates a pending booking from locked server inventory and returns only public booking details', async () => {
    const idempotencyKey = `booking-test-${randomUUID()}`;
    const response = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        roomTypeSlug,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        guestCount: 3,
        roomQuantity: 2,
        guestName: 'Fictional Guest',
        guestPhone: '+989121234567',
        guestEmail: 'guest@example.invalid',
      })
      .expect(201);

    const responseBody = response.body as unknown as BookingResponseDto;
    expect(responseBody.reference).toMatch(/^[A-Za-z0-9_-]{10,16}$/);
    expect(responseBody).toMatchObject({
      status: 'PENDING_CONFIRMATION',
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      guestCount: 3,
      roomQuantity: 2,
      roomType: { slug: roomTypeSlug, name: 'Garden suite' },
      priceSummary: {
        numberOfNights: 2,
        totalPriceToman: '7000000',
        nights: [
          {
            stayDate: dates.checkIn,
            nightlyPriceToman: '1200000',
            roomQuantity: 2,
            amountToman: '2400000',
          },
          {
            stayDate: dates.secondNight,
            nightlyPriceToman: '2300000',
            roomQuantity: 2,
            amountToman: '4600000',
          },
        ],
      },
    });
    expect(response.text).not.toContain('Fictional Guest');
    expect(response.text).not.toContain('guest@example.invalid');
    expect(response.text).not.toContain('+989121234567');
    expect(response.text).not.toContain(roomTypeId);
    expect(response.text).not.toContain(idempotencyKey);

    const booking = await prisma.booking.findUnique({
      where: { idempotencyKey },
      include: { nights: { orderBy: { stayDate: 'asc' } } },
    });
    expect(booking).not.toBeNull();
    expect(booking?.guestPhone).toBe('+989121234567');
    expect(booking?.totalPriceToman).toBe(7_000_000n);
    expect(booking?.nights.map((night) => night.amountToman)).toEqual([2_400_000n, 4_600_000n]);
    const inventory = await prisma.roomNightInventory.findMany({
      where: { roomTypeId },
      orderBy: { stayDate: 'asc' },
      select: { heldRooms: true, bookedRooms: true },
    });
    expect(inventory).toEqual([
      { heldRooms: 2, bookedRooms: 0 },
      { heldRooms: 2, bookedRooms: 0 },
    ]);
  });

  it('requires an idempotency key and rejects invalid mobile numbers before creating a booking', async () => {
    const bookingsBefore = await prisma.booking.count({ where: { roomTypeId } });
    const body = {
      roomTypeSlug,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      guestCount: 1,
      roomQuantity: 1,
      guestName: 'Fictional Guest',
      guestPhone: '09121234567',
    };

    const missingKey = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .send(body)
      .expect(400);
    expect(missingKey.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });

    const invalidPhone = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Idempotency-Key', `booking-test-${randomUUID()}`)
      .send({ ...body, guestPhone: '12345' })
      .expect(400);
    const invalidPhoneBody = invalidPhone.body as unknown as ValidationResponseBody;
    expect(invalidPhoneBody).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invalidPhoneBody.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'guestPhone' })]),
    );
    expect(await prisma.booking.count({ where: { roomTypeId } })).toBe(bookingsBefore);
  });

  it('rejects a guest count above the selected room quantity capacity without holding rooms', async () => {
    const before = await prisma.roomNightInventory.findMany({
      where: { roomTypeId },
      orderBy: { stayDate: 'asc' },
      select: { heldRooms: true },
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Idempotency-Key', `booking-test-${randomUUID()}`)
      .send({
        roomTypeSlug,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        guestCount: 5,
        roomQuantity: 2,
        guestName: 'Fictional Guest',
        guestPhone: '+989121234567',
      })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'BOOKING_CAPACITY_EXCEEDED' });
    expect(
      await prisma.roomNightInventory.findMany({
        where: { roomTypeId },
        orderBy: { stayDate: 'asc' },
        select: { heldRooms: true },
      }),
    ).toEqual(before);
  });

  it('returns the first result for an equivalent retry and rejects key reuse with changed input', async () => {
    const key = `booking-test-${randomUUID()}`;
    const inventoryBefore = await prisma.roomNightInventory.findMany({
      where: { roomTypeId },
      orderBy: { stayDate: 'asc' },
      select: { heldRooms: true },
    });
    const body = {
      roomTypeSlug,
      checkIn: dates.checkIn,
      checkOut: dates.secondNight,
      guestCount: 1,
      roomQuantity: 1,
      guestName: 'Fictional Guest',
      guestPhone: '0912 123 4567',
    };
    const first = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(retry.body).toEqual(first.body);
    expect(await prisma.booking.count({ where: { idempotencyKey: key } })).toBe(1);
    const inventoryAfterRetry = await prisma.roomNightInventory.findMany({
      where: { roomTypeId },
      orderBy: { stayDate: 'asc' },
      select: { heldRooms: true },
    });
    expect(
      inventoryAfterRetry.map((night, index) => night.heldRooms - inventoryBefore[index].heldRooms),
    ).toEqual([1, 0]);

    const changedRequest = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Idempotency-Key', key)
      .send({ ...body, guestName: 'A Different Guest' })
      .expect(409);
    expect(changedRequest.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(await prisma.booking.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('returns an availability-changed error with no partial hold for a sold-out night', async () => {
    const key = `booking-test-${randomUUID()}`;
    const response = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Idempotency-Key', key)
      .send({
        roomTypeSlug: soldOutRoomTypeSlug,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        guestCount: 1,
        roomQuantity: 1,
        guestName: 'Fictional Guest',
        guestPhone: '09121234567',
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: 'AVAILABILITY_CHANGED' });
    expect(await prisma.booking.count({ where: { roomTypeId: soldOutRoomTypeId } })).toBe(0);
    expect(
      await prisma.roomNightInventory.findMany({
        where: { roomTypeId: soldOutRoomTypeId },
        orderBy: { stayDate: 'asc' },
        select: { heldRooms: true },
      }),
    ).toEqual([{ heldRooms: 0 }, { heldRooms: 1 }]);
  });

  it('allows only one concurrent request to hold the final room for overlapping dates', async () => {
    const submit = (key: string) =>
      request(app.getHttpServer()).post('/api/v1/bookings').set('Idempotency-Key', key).send({
        roomTypeSlug: lastRoomTypeSlug,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        guestCount: 2,
        roomQuantity: 1,
        guestName: 'Fictional Guest',
        guestPhone: '۰۹۱۲۱۲۳۴۵۶۷',
      });
    const [first, second] = await Promise.all([
      submit(`booking-test-${randomUUID()}`),
      submit(`booking-test-${randomUUID()}`),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const inventory = await prisma.roomNightInventory.findMany({
      where: { roomTypeId: lastRoomTypeId },
      orderBy: { stayDate: 'asc' },
      select: { totalRooms: true, heldRooms: true, bookedRooms: true },
    });
    expect(inventory).toEqual([
      { totalRooms: 1, heldRooms: 1, bookedRooms: 0 },
      { totalRooms: 1, heldRooms: 1, bookedRooms: 0 },
    ]);
    expect(await prisma.booking.count({ where: { roomTypeId: lastRoomTypeId } })).toBe(1);
  });
});
