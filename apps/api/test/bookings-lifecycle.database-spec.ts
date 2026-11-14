import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import { addDays, getHotelBusinessDate } from '../src/availability/date-range';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { BookingExpiryWorker } from '../src/bookings/booking-expiry.worker';
import { BookingsService } from '../src/bookings/bookings.service';
import { CreateBookingDto } from '../src/bookings/dto/create-booking.dto';

describe('PostgreSQL booking lifecycle invariants', () => {
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
  let expiryWorker: BookingExpiryWorker;

  async function createFixture(): Promise<{ roomTypeId: string; roomTypeSlug: string }> {
    const suffix = randomUUID();
    const roomTypeSlug = `lifecycle-db-${suffix}`;
    const roomType = await prisma.roomType.create({
      data: {
        hotelId,
        slug: roomTypeSlug,
        name: 'Lifecycle test room',
        description: 'Fictional lifecycle test room.',
        maxGuestsPerRoom: 2,
        amenities: ['wifi'],
      },
    });
    roomTypeIds.push(roomType.id);
    await prisma.roomNightInventory.createMany({
      data: [dates.checkIn, dates.secondNight].map((stayDate) => ({
        roomTypeId: roomType.id,
        stayDate: new Date(`${stayDate}T00:00:00.000Z`),
        totalRooms: 3,
        heldRooms: 0,
        bookedRooms: 0,
        nightlyPriceToman: 1_200_000n,
      })),
    });
    return { roomTypeId: roomType.id, roomTypeSlug };
  }

  function input(roomTypeSlug: string): CreateBookingDto {
    return {
      roomTypeSlug,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      guestCount: 2,
      roomQuantity: 1,
      guestName: 'Fictional Lifecycle Guest',
      guestPhone: '+989121234567',
    };
  }

  async function createPendingBooking(roomTypeSlug: string): Promise<string> {
    const booking = await bookings.create(input(roomTypeSlug), `lifecycle-${randomUUID()}`);
    return booking.reference;
  }

  async function bookingId(reference: string): Promise<string> {
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { publicReference: reference },
      select: { id: true },
    });
    return booking.id;
  }

  async function expectCounters(
    roomTypeId: string,
    expected: Array<{ heldRooms: number; bookedRooms: number }>,
  ): Promise<void> {
    const counters = await prisma.roomNightInventory.findMany({
      where: { roomTypeId },
      orderBy: { stayDate: 'asc' },
      select: { heldRooms: true, bookedRooms: true },
    });
    expect(counters).toEqual(expected);
  }

  async function expireAt(reference: string): Promise<void> {
    await prisma.booking.update({
      where: { publicReference: reference },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
  }

  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      'SELECT current_database() AS database_name',
    );
    expect(result.rows[0].database_name).toMatch(/_test$/);

    moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleFixture.get(PrismaService);
    bookings = moduleFixture.get(BookingsService);
    expiryWorker = moduleFixture.get(BookingExpiryWorker);
    await prisma.hotel.create({
      data: {
        id: hotelId,
        slug: `lifecycle-db-hotel-${randomUUID()}`,
        name: 'Fictional lifecycle test hotel',
        address: 'Fictional address',
        description: 'Fictional lifecycle test hotel.',
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

  it('converts all held nights to booked atomically on confirmation', async () => {
    const fixture = await createFixture();
    const reference = await createPendingBooking(fixture.roomTypeSlug);

    const updated = await bookings.transition(reference, 'CONFIRM');
    const persisted = await prisma.booking.findUniqueOrThrow({
      where: { publicReference: reference },
      select: { confirmedAt: true },
    });

    expect(updated.status).toBe('CONFIRMED');
    expect(persisted.confirmedAt).toBeInstanceOf(Date);
    await expectCounters(fixture.roomTypeId, [
      { heldRooms: 0, bookedRooms: 1 },
      { heldRooms: 0, bookedRooms: 1 },
    ]);
  });

  it.each(['REJECT', 'CANCEL'] as const)(
    'releases pending holds exactly once on %s',
    async (action) => {
      const fixture = await createFixture();
      const reference = await createPendingBooking(fixture.roomTypeSlug);

      const first = await bookings.transition(reference, action);
      const retry = await bookings.transition(reference, action);

      expect(first.status).toBe(action === 'REJECT' ? 'REJECTED' : 'CANCELLED');
      expect(retry).toMatchObject({ status: first.status });
      await expectCounters(fixture.roomTypeId, [
        { heldRooms: 0, bookedRooms: 0 },
        { heldRooms: 0, bookedRooms: 0 },
      ]);
    },
  );

  it('requires and persists a reason when cancelling a confirmed booking', async () => {
    const fixture = await createFixture();
    const reference = await createPendingBooking(fixture.roomTypeSlug);
    await bookings.transition(reference, 'CONFIRM');

    await expect(bookings.transition(reference, 'CANCEL')).rejects.toMatchObject({
      response: { code: 'CANCELLATION_REASON_REQUIRED' },
    });
    const cancelled = await bookings.transition(reference, 'CANCEL', {
      cancellationReason: 'Guest requested cancellation.',
    });

    expect(cancelled.status).toBe('CANCELLED');
    expect(
      await prisma.booking.findUniqueOrThrow({ where: { publicReference: reference } }),
    ).toMatchObject({ cancellationReason: 'Guest requested cancellation.' });
    await expectCounters(fixture.roomTypeId, [
      { heldRooms: 0, bookedRooms: 0 },
      { heldRooms: 0, bookedRooms: 0 },
    ]);
  });

  it('does not cancel a confirmed booking after the hotel check-in date begins', async () => {
    const fixture = await createFixture();
    const reference = await createPendingBooking(fixture.roomTypeSlug);
    await bookings.transition(reference, 'CONFIRM');
    await prisma.booking.update({
      where: { publicReference: reference },
      data: { checkIn: new Date(`${getHotelBusinessDate()}T00:00:00.000Z`) },
    });

    await expect(
      bookings.transition(reference, 'CANCEL', { cancellationReason: 'Too late.' }),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_STAY_STARTED' } });
    await expectCounters(fixture.roomTypeId, [
      { heldRooms: 0, bookedRooms: 1 },
      { heldRooms: 0, bookedRooms: 1 },
    ]);
  });

  it('expires due pending bookings and releases every hold', async () => {
    const fixture = await createFixture();
    const reference = await createPendingBooking(fixture.roomTypeSlug);
    await expireAt(reference);

    const result = await expiryWorker.runOnce();
    const persisted = await prisma.booking.findUniqueOrThrow({
      where: { publicReference: reference },
      select: { status: true, expiredAt: true },
    });

    expect(result).toMatchObject({ expired: 1, failed: 0 });
    expect(persisted.status).toBe('EXPIRED');
    expect(persisted.expiredAt).toBeInstanceOf(Date);
    await expectCounters(fixture.roomTypeId, [
      { heldRooms: 0, bookedRooms: 0 },
      { heldRooms: 0, bookedRooms: 0 },
    ]);
  });

  it('serializes repeated expiry attempts without releasing counters twice', async () => {
    const fixture = await createFixture();
    const reference = await createPendingBooking(fixture.roomTypeSlug);
    await expireAt(reference);
    const id = await bookingId(reference);

    await Promise.all([bookings.expirePending(id), bookings.expirePending(id)]);

    expect(
      await prisma.booking.findUniqueOrThrow({ where: { publicReference: reference } }),
    ).toMatchObject({
      status: 'EXPIRED',
    });
    await expectCounters(fixture.roomTypeId, [
      { heldRooms: 0, bookedRooms: 0 },
      { heldRooms: 0, bookedRooms: 0 },
    ]);
  });

  it('allows only one valid final state when staff confirmation races expiry', async () => {
    const fixture = await createFixture();
    const reference = await createPendingBooking(fixture.roomTypeSlug);
    await expireAt(reference);
    const id = await bookingId(reference);

    const results = await Promise.allSettled([
      bookings.transition(reference, 'CONFIRM'),
      bookings.expirePending(id),
    ]);

    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.booking.findUniqueOrThrow({ where: { publicReference: reference } }),
    ).toMatchObject({
      status: 'EXPIRED',
    });
    await expectCounters(fixture.roomTypeId, [
      { heldRooms: 0, bookedRooms: 0 },
      { heldRooms: 0, bookedRooms: 0 },
    ]);
  });
});
