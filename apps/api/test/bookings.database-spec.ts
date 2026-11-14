import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import { addDays, getHotelBusinessDate } from '../src/availability/date-range';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { BookingsService } from '../src/bookings/bookings.service';
import { CreateBookingDto } from '../src/bookings/dto/create-booking.dto';

describe('PostgreSQL booking transaction invariants', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hotelId = randomUUID();
  const dates = {
    checkIn: addDays(getHotelBusinessDate(), 12),
    secondNight: addDays(getHotelBusinessDate(), 13),
    checkOut: addDays(getHotelBusinessDate(), 14),
  };
  const roomTypeIds: string[] = [];
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let bookings: BookingsService;

  async function createFixture(
    options: {
      totalRooms?: number;
      firstNightPrice?: bigint;
      secondNightPrice?: bigint;
    } = {},
  ): Promise<{ roomTypeId: string; roomTypeSlug: string }> {
    const suffix = randomUUID();
    const roomTypeSlug = `booking-db-${suffix}`;
    const roomType = await prisma.roomType.create({
      data: {
        hotelId,
        slug: roomTypeSlug,
        name: 'Database test suite',
        description: 'Fictional room for a PostgreSQL integration test.',
        maxGuestsPerRoom: 2,
        amenities: ['wifi'],
      },
    });
    roomTypeIds.push(roomType.id);
    await prisma.roomNightInventory.createMany({
      data: [
        {
          roomTypeId: roomType.id,
          stayDate: new Date(`${dates.checkIn}T00:00:00.000Z`),
          totalRooms: options.totalRooms ?? 2,
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: options.firstNightPrice ?? 1_200_000n,
        },
        {
          roomTypeId: roomType.id,
          stayDate: new Date(`${dates.secondNight}T00:00:00.000Z`),
          totalRooms: options.totalRooms ?? 2,
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: options.secondNightPrice ?? 2_300_000n,
        },
      ],
    });
    return { roomTypeId: roomType.id, roomTypeSlug };
  }

  function input(roomTypeSlug: string, changes: Partial<CreateBookingDto> = {}): CreateBookingDto {
    return {
      roomTypeSlug,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      guestCount: 2,
      roomQuantity: 1,
      guestName: 'Fictional Integration Guest',
      guestPhone: '+989121234567',
      ...changes,
    };
  }

  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      'SELECT current_database() AS database_name',
    );
    expect(result.rows[0].database_name).toMatch(/_test$/);

    moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleFixture.get(PrismaService);
    bookings = moduleFixture.get(BookingsService);
    await prisma.hotel.create({
      data: {
        id: hotelId,
        slug: `booking-db-hotel-${randomUUID()}`,
        name: 'Fictional database test hotel',
        address: 'Fictional address',
        description: 'Fictional booking database fixtures.',
      },
    });
  });

  afterEach(async () => {
    if (roomTypeIds.length === 0) {
      return;
    }
    await prisma.booking.deleteMany({ where: { roomTypeId: { in: roomTypeIds } } });
    await prisma.roomNightInventory.deleteMany({ where: { roomTypeId: { in: roomTypeIds } } });
    await prisma.roomType.deleteMany({ where: { id: { in: roomTypeIds } } });
    roomTypeIds.length = 0;
  });

  afterAll(async () => {
    await prisma?.hotel.deleteMany({ where: { id: hotelId } });
    await moduleFixture?.close();
    await pool.end();
  });

  it('rolls back holds on earlier nights when booking insertion fails', async () => {
    const fixture = await createFixture();
    await pool.query('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS hbe008_force_booking_failure');
    await pool.query(
      "ALTER TABLE bookings ADD CONSTRAINT hbe008_force_booking_failure CHECK (guest_name <> 'force-rollback')",
    );

    try {
      await expect(
        bookings.create(
          input(fixture.roomTypeSlug, { guestName: 'force-rollback' }),
          `booking-db-${randomUUID()}`,
        ),
      ).rejects.toThrow();

      const inventory = await prisma.roomNightInventory.findMany({
        where: { roomTypeId: fixture.roomTypeId },
        orderBy: { stayDate: 'asc' },
        select: { heldRooms: true, bookedRooms: true },
      });
      expect(inventory).toEqual([
        { heldRooms: 0, bookedRooms: 0 },
        { heldRooms: 0, bookedRooms: 0 },
      ]);
      expect(await prisma.booking.count({ where: { roomTypeId: fixture.roomTypeId } })).toBe(0);
    } finally {
      await pool.query(
        'ALTER TABLE bookings DROP CONSTRAINT IF EXISTS hbe008_force_booking_failure',
      );
    }
  });

  it('keeps per-night price snapshots after inventory prices change', async () => {
    const fixture = await createFixture();
    const key = `booking-db-${randomUUID()}`;
    const response = await bookings.create(input(fixture.roomTypeSlug), key);

    await prisma.roomNightInventory.updateMany({
      where: { roomTypeId: fixture.roomTypeId },
      data: { nightlyPriceToman: 9_900_000n },
    });
    const stored = await prisma.booking.findUnique({
      where: { idempotencyKey: key },
      include: { nights: { orderBy: { stayDate: 'asc' } } },
    });

    expect(response.priceSummary.totalPriceToman).toBe('3500000');
    expect(stored?.totalPriceToman).toBe(3_500_000n);
    expect(stored?.nights.map((night) => night.nightlyPriceToman)).toEqual([
      1_200_000n,
      2_300_000n,
    ]);
    expect(stored?.nights.map((night) => night.amountToman)).toEqual([1_200_000n, 2_300_000n]);
  });

  it('returns one original booking for concurrent equivalent requests with the same key', async () => {
    const fixture = await createFixture();
    const key = `booking-db-${randomUUID()}`;
    const requestInput = input(fixture.roomTypeSlug);
    const [first, retry] = await Promise.all([
      bookings.create(requestInput, key),
      bookings.create(requestInput, key),
    ]);

    expect(retry).toEqual(first);
    expect(await prisma.booking.count({ where: { idempotencyKey: key } })).toBe(1);
    expect(
      await prisma.roomNightInventory.findMany({
        where: { roomTypeId: fixture.roomTypeId },
        orderBy: { stayDate: 'asc' },
        select: { heldRooms: true },
      }),
    ).toEqual([{ heldRooms: 1 }, { heldRooms: 1 }]);
  });

  it('admits only one of two concurrent requests for the final room', async () => {
    const fixture = await createFixture({ totalRooms: 1 });
    const outcomes = await Promise.allSettled([
      bookings.create(input(fixture.roomTypeSlug), `booking-db-${randomUUID()}`),
      bookings.create(input(fixture.roomTypeSlug), `booking-db-${randomUUID()}`),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await prisma.booking.count({ where: { roomTypeId: fixture.roomTypeId } })).toBe(1);
    expect(
      await prisma.roomNightInventory.findMany({
        where: { roomTypeId: fixture.roomTypeId },
        orderBy: { stayDate: 'asc' },
        select: { totalRooms: true, heldRooms: true, bookedRooms: true },
      }),
    ).toEqual([
      { totalRooms: 1, heldRooms: 1, bookedRooms: 0 },
      { totalRooms: 1, heldRooms: 1, bookedRooms: 0 },
    ]);
  });
});
