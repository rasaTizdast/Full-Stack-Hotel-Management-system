import { randomBytes, randomInt } from 'node:crypto';
import { addDays, parseDateOnly } from '../src/availability/date-range';
import {
  assertTestDatabaseUrl,
  cleanupWalkInFixture,
  WALK_IN_FIXTURE_CLEANUP_REASON,
  WALK_IN_FIXTURE_GUEST_NAME,
} from './walk-in-fixture-cleanup';
import { RoomBoardFixture } from './room-board-fixture';

describe('walk-in browser fixture cleanup', () => {
  let fixture: RoomBoardFixture;

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
  });

  afterAll(async () => {
    await fixture?.close();
  });

  async function createWalkInFixture() {
    const property = await fixture.createProperty();
    const receptionist = await fixture.staff('RECEPTIONIST');
    const reference = randomBytes(9).toString('base64url');
    const guestPhone = `+98915${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
    const roomQuantity = 2;
    await fixture.inventory(property.type.id, roomQuantity);
    const confirmedAt = new Date();
    const checkOut = addDays(fixture.checkIn, 2);
    const booking = await fixture.prisma.booking.create({
      data: {
        publicReference: reference,
        status: 'CONFIRMED',
        checkIn: parseDateOnly(fixture.checkIn),
        checkOut: parseDateOnly(checkOut),
        guestCount: 1,
        roomTypeId: property.type.id,
        roomQuantity,
        guestName: WALK_IN_FIXTURE_GUEST_NAME,
        guestPhone,
        guestEmail: null,
        totalPriceToman: 3_000n,
        confirmedAt,
        expiresAt: confirmedAt,
        nights: {
          create: [fixture.checkIn, fixture.next].map((stayDate) => ({
            stayDate: parseDateOnly(stayDate),
            nightlyPriceToman: 750n,
            roomQuantity,
            amountToman: 1_500n,
          })),
        },
      },
    });
    await fixture.prisma.auditEvent.create({
      data: {
        actorStaffUserId: receptionist.id,
        eventName: 'BOOKING_WALK_IN',
        targetType: 'BOOKING',
        targetId: booking.id,
        after: { status: 'CONFIRMED' },
      },
    });
    await fixture.prisma.auditEvent.create({
      data: {
        actorStaffUserId: receptionist.id,
        eventName: 'BOOKING_NOTE_UPDATED',
        targetType: 'BOOKING',
        targetId: booking.id,
        after: { status: 'CONFIRMED' },
      },
    });
    return { property, booking, reference, guestPhone };
  }

  it('cancels only the exact walk-in and restores its booked inventory once', async () => {
    const walkIn = await createWalkInFixture();

    await expect(
      cleanupWalkInFixture(fixture.prisma, {
        reference: walkIn.reference,
        guestPhone: walkIn.guestPhone,
      }),
    ).resolves.toBe('cancelled');

    const persisted = await fixture.prisma.booking.findUniqueOrThrow({
      where: { id: walkIn.booking.id },
    });
    expect(persisted).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: WALK_IN_FIXTURE_CLEANUP_REASON,
    });
    expect(persisted.cancelledAt).toBeInstanceOf(Date);
    await expect(
      fixture.prisma.roomNightInventory.findMany({
        where: { roomTypeId: walkIn.property.type.id },
        orderBy: { stayDate: 'asc' },
        select: { bookedRooms: true },
      }),
    ).resolves.toEqual([{ bookedRooms: 0 }, { bookedRooms: 0 }]);
    await expect(
      fixture.prisma.auditEvent.findMany({
        where: { targetId: walkIn.booking.id },
        orderBy: { eventName: 'asc' },
        select: { eventName: true },
      }),
    ).resolves.toEqual([
      { eventName: 'BOOKING_NOTE_UPDATED' },
      { eventName: 'BOOKING_TEST_FIXTURE_CLEANUP' },
      { eventName: 'BOOKING_WALK_IN' },
    ]);

    await expect(
      cleanupWalkInFixture(fixture.prisma, {
        reference: walkIn.reference,
        guestPhone: walkIn.guestPhone,
      }),
    ).resolves.toBe('already-cleaned');

    const retainedEvent = await fixture.prisma.auditEvent.findFirstOrThrow({
      where: { eventName: 'BOOKING_NOTE_UPDATED', targetId: walkIn.booking.id },
    });
    await expect(
      fixture.prisma.auditEvent.update({
        where: { id: retainedEvent.id },
        data: { reason: 'must remain append-only' },
      }),
    ).rejects.toThrow('Audit events are append-only.');
  });

  it('fails closed on a phone, guest-name, or status mismatch', async () => {
    const walkIn = await createWalkInFixture();

    await expect(
      cleanupWalkInFixture(fixture.prisma, {
        reference: walkIn.reference,
        guestPhone: walkIn.guestPhone.slice(0, -1) + (walkIn.guestPhone.endsWith('0') ? '1' : '0'),
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_MISMATCH' });

    await fixture.prisma.booking.update({
      where: { id: walkIn.booking.id },
      data: { guestName: 'Different guest' },
    });
    await expect(
      cleanupWalkInFixture(fixture.prisma, {
        reference: walkIn.reference,
        guestPhone: walkIn.guestPhone,
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_MISMATCH' });
    await fixture.prisma.booking.update({
      where: { id: walkIn.booking.id },
      data: { guestName: WALK_IN_FIXTURE_GUEST_NAME },
    });

    await fixture.prisma.booking.update({
      where: { id: walkIn.booking.id },
      data: { status: 'CHECKED_IN' },
    });
    await expect(
      cleanupWalkInFixture(fixture.prisma, {
        reference: walkIn.reference,
        guestPhone: walkIn.guestPhone,
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_MISMATCH' });

    const unchanged = await fixture.prisma.roomNightInventory.findMany({
      where: { roomTypeId: walkIn.property.type.id },
      orderBy: { stayDate: 'asc' },
      select: { bookedRooms: true },
    });
    expect(unchanged).toEqual([{ bookedRooms: 2 }, { bookedRooms: 2 }]);
  });

  it('refuses assignments and missing inventory without a partial counter decrement', async () => {
    const walkIn = await createWalkInFixture();
    await fixture.prisma.roomAssignment.create({
      data: {
        bookingId: walkIn.booking.id,
        roomId: walkIn.property.rooms[0].id,
        roomTypeId: walkIn.property.type.id,
        startDate: parseDateOnly(fixture.checkIn),
        endDate: parseDateOnly(fixture.checkOut),
      },
    });
    await expect(
      cleanupWalkInFixture(fixture.prisma, {
        reference: walkIn.reference,
        guestPhone: walkIn.guestPhone,
      }),
    ).rejects.toMatchObject({ code: 'ASSIGNMENTS_PRESENT' });
    await fixture.prisma.roomAssignment.deleteMany({ where: { bookingId: walkIn.booking.id } });

    const missingNight = await fixture.prisma.roomNightInventory.findUniqueOrThrow({
      where: {
        roomTypeId_stayDate: {
          roomTypeId: walkIn.property.type.id,
          stayDate: parseDateOnly(fixture.next),
        },
      },
    });
    await fixture.prisma.roomNightInventory.delete({ where: { id: missingNight.id } });
    await expect(
      cleanupWalkInFixture(fixture.prisma, {
        reference: walkIn.reference,
        guestPhone: walkIn.guestPhone,
      }),
    ).rejects.toMatchObject({ code: 'INVENTORY_MISMATCH' });

    const afterRollback = await fixture.prisma.roomNightInventory.findMany({
      where: { roomTypeId: walkIn.property.type.id },
      orderBy: { stayDate: 'asc' },
      select: { bookedRooms: true },
    });
    expect(afterRollback).toEqual([{ bookedRooms: 2 }]);
    expect(
      await fixture.prisma.booking.findUniqueOrThrow({ where: { id: walkIn.booking.id } }),
    ).toMatchObject({ status: 'CONFIRMED' });

    await fixture.prisma.roomNightInventory.create({
      data: {
        roomTypeId: walkIn.property.type.id,
        stayDate: parseDateOnly(fixture.next),
        totalRooms: 3,
        bookedRooms: 2,
        nightlyPriceToman: 1_500n,
      },
    });
    await expect(
      cleanupWalkInFixture(fixture.prisma, {
        reference: walkIn.reference,
        guestPhone: walkIn.guestPhone,
      }),
    ).resolves.toBe('cancelled');
  });

  it('refuses a non-test database URL before opening a database connection', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow('UNSAFE_DATABASE_URL');
    expect(() => assertTestDatabaseUrl('postgresql://test:test@localhost:5432/hotel_dev')).toThrow(
      'UNSAFE_DATABASE_URL',
    );
    expect(assertTestDatabaseUrl('postgresql://test:test@localhost:5432/hotel_api_test')).toBe(
      'postgresql://test:test@localhost:5432/hotel_api_test',
    );
  });
});
