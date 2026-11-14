import { addDays, getHotelBusinessDate } from '../src/availability/date-range';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { AvailabilityResponseDto } from '../src/availability/dto/availability-response.dto';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';

describe('Availability API (e2e)', () => {
  const hotelId = randomUUID();
  const fixtureSlug = `availability-${randomUUID().slice(0, 8)}`;
  const dates = {
    checkIn: addDays(getHotelBusinessDate(), 7),
    secondNight: addDays(getHotelBusinessDate(), 8),
    checkOut: addDays(getHotelBusinessDate(), 9),
  };
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const roomTypeIds: string[] = [];

  async function createRoomType(
    name: string,
    slug: string,
    options: {
      maxGuestsPerRoom?: number;
      firstNight?: { totalRooms: number; heldRooms?: number; bookedRooms?: number; price: bigint };
      secondNight?: { totalRooms: number; heldRooms?: number; bookedRooms?: number; price: bigint };
      checkoutNight?: {
        totalRooms: number;
        heldRooms?: number;
        bookedRooms?: number;
        price: bigint;
      };
    },
  ): Promise<void> {
    const roomType = await prisma.roomType.create({
      data: {
        hotelId,
        slug,
        name,
        description: 'Fictional availability test room.',
        maxGuestsPerRoom: options.maxGuestsPerRoom ?? 4,
        amenities: ['wifi'],
      },
    });
    roomTypeIds.push(roomType.id);

    const nights = [
      [dates.checkIn, options.firstNight],
      [dates.secondNight, options.secondNight],
      [dates.checkOut, options.checkoutNight],
    ] as const;
    await prisma.roomNightInventory.createMany({
      data: nights.flatMap(([stayDate, night]) =>
        night
          ? [
              {
                roomTypeId: roomType.id,
                stayDate: new Date(`${stayDate}T00:00:00.000Z`),
                totalRooms: night.totalRooms,
                heldRooms: night.heldRooms ?? 0,
                bookedRooms: night.bookedRooms ?? 0,
                nightlyPriceToman: night.price,
              },
            ]
          : [],
      ),
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

    await prisma.hotel.create({
      data: {
        id: hotelId,
        slug: fixtureSlug,
        name: 'Availability fixture hotel',
        address: 'Fictional test address',
        description: 'Fictional API test hotel.',
      },
    });
    await createRoomType('Available suite', `${fixtureSlug}-available`, {
      firstNight: { totalRooms: 5, heldRooms: 1, bookedRooms: 1, price: 2_400_000n },
      secondNight: { totalRooms: 5, bookedRooms: 2, price: 3_100_000n },
      checkoutNight: { totalRooms: 0, price: 99_000_000n },
    });
    await createRoomType('Sold out suite', `${fixtureSlug}-sold-out`, {
      firstNight: { totalRooms: 3, price: 1_000_000n },
      secondNight: { totalRooms: 1, heldRooms: 1, price: 1_000_000n },
    });
    await createRoomType('Missing night suite', `${fixtureSlug}-missing`, {
      firstNight: { totalRooms: 3, price: 1_500_000n },
    });
    await createRoomType('Single guest suite', `${fixtureSlug}-single`, {
      maxGuestsPerRoom: 1,
      firstNight: { totalRooms: 3, price: 900_000n },
      secondNight: { totalRooms: 3, price: 900_000n },
    });
  });

  afterAll(async () => {
    if (roomTypeIds.length > 0) {
      await prisma.roomNightInventory.deleteMany({ where: { roomTypeId: { in: roomTypeIds } } });
      await prisma.roomType.deleteMany({ where: { id: { in: roomTypeIds } } });
    }
    if (prisma) {
      await prisma.hotel.deleteMany({ where: { id: hotelId } });
    }
    await app.close();
  });

  it('returns full-range availability and server-calculated integer Toman prices excluding checkout', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({ checkIn: dates.checkIn, checkOut: dates.checkOut, guests: 2 })
      .expect(200);
    const body = response.body as unknown as AvailabilityResponseDto;

    expect(body).toMatchObject({
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      guests: 2,
      numberOfNights: 2,
    });
    const room = body.roomTypes.find(
      (candidate: { slug: string }) => candidate.slug === `${fixtureSlug}-available`,
    );
    expect(room).toEqual({
      slug: `${fixtureSlug}-available`,
      name: 'Available suite',
      maxGuestsPerRoom: 4,
      isAvailable: true,
      availableRooms: 3,
      totalPriceToman: '5500000',
      nightlyBreakdown: [
        {
          stayDate: dates.checkIn,
          isAvailable: true,
          availableRooms: 3,
          nightlyPriceToman: '2400000',
        },
        {
          stayDate: dates.secondNight,
          isAvailable: true,
          availableRooms: 3,
          nightlyPriceToman: '3100000',
        },
      ],
    });
  });

  it('marks a room unavailable when any requested night is missing or sold out', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({ checkIn: dates.checkIn, checkOut: dates.checkOut, guests: 2 })
      .expect(200);
    const body = response.body as unknown as AvailabilityResponseDto;
    const soldOut = body.roomTypes.find(
      (candidate: { slug: string }) => candidate.slug === `${fixtureSlug}-sold-out`,
    );
    const missing = body.roomTypes.find(
      (candidate: { slug: string }) => candidate.slug === `${fixtureSlug}-missing`,
    );

    if (!soldOut || !missing) {
      throw new Error('Availability fixtures were not returned by the API.');
    }

    expect(soldOut).toMatchObject({ isAvailable: false, availableRooms: 0, totalPriceToman: null });
    expect(soldOut.nightlyBreakdown[1]).toMatchObject({
      isAvailable: false,
      availableRooms: 0,
      nightlyPriceToman: '1000000',
    });
    expect(missing).toMatchObject({ isAvailable: false, availableRooms: 0, totalPriceToman: null });
    expect(missing.nightlyBreakdown[1]).toMatchObject({
      stayDate: dates.secondNight,
      isAvailable: false,
      availableRooms: 0,
      nightlyPriceToman: null,
    });
  });

  it('marks a room unavailable when guest count exceeds per-room capacity', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({ checkIn: dates.checkIn, checkOut: dates.checkOut, guests: 2 })
      .expect(200);
    const body = response.body as unknown as AvailabilityResponseDto;
    const room = body.roomTypes.find(
      (candidate: { slug: string }) => candidate.slug === `${fixtureSlug}-single`,
    );

    expect(room).toMatchObject({
      maxGuestsPerRoom: 1,
      isAvailable: false,
      availableRooms: 0,
      totalPriceToman: null,
    });
  });

  it('rejects invalid, past, and longer-than-30-night ranges with safe business errors', async () => {
    const invalid = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({ checkIn: '2026-02-30', checkOut: '2026-03-02', guests: 2 })
      .expect(400);
    const invalidBody = invalid.body as unknown as { code: string; message: string };
    expect(invalidBody).toMatchObject({ code: 'INVALID_DATE_RANGE' });
    expect(invalidBody.message).toBe(
      'Use valid Gregorian YYYY-MM-DD dates and checkout after check-in.',
    );

    const past = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({ checkIn: '2000-01-01', checkOut: '2000-01-02', guests: 2 })
      .expect(400);
    const pastBody = past.body as unknown as { code: string; message: string };
    expect(pastBody).toMatchObject({ code: 'CHECK_IN_IN_PAST' });
    expect(pastBody.message).toBe('Check-in date must be today or later.');

    const longStay = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({
        checkIn: addDays(getHotelBusinessDate(), 1),
        checkOut: addDays(getHotelBusinessDate(), 32),
        guests: 2,
      })
      .expect(400);
    const longStayBody = longStay.body as unknown as { code: string; message: string };
    expect(longStayBody).toMatchObject({ code: 'STAY_TOO_LONG' });
    expect(longStayBody.message).toBe('Stay cannot exceed 30 nights.');
  });

  it('accepts an exact 30-night stay and rejects invalid guest counts', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({
        checkIn: addDays(getHotelBusinessDate(), 1),
        checkOut: addDays(getHotelBusinessDate(), 31),
        guests: 2,
      })
      .expect(200);

    const invalidGuests = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({ checkIn: dates.checkIn, checkOut: dates.checkOut, guests: 21 })
      .expect(400);
    const invalidGuestsBody = invalidGuests.body as unknown as { code: string; message: string };
    expect(invalidGuestsBody).toMatchObject({ code: 'INVALID_GUEST_COUNT' });
    expect(invalidGuestsBody.message).toBe('Guest count must be an integer from 1 to 20.');

    const zeroGuests = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({ checkIn: dates.checkIn, checkOut: dates.checkOut, guests: 0 })
      .expect(400);
    const zeroGuestsBody = zeroGuests.body as unknown as { code: string; message: string };
    expect(zeroGuestsBody).toMatchObject({ code: 'INVALID_GUEST_COUNT' });
    expect(zeroGuestsBody.message).toBe('Guest count must be an integer from 1 to 20.');
  });
});
