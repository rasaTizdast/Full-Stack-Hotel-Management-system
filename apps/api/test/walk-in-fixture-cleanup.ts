import { Prisma, type PrismaClient } from '../src/generated/prisma/client';

export const WALK_IN_FIXTURE_GUEST_NAME = 'مهمان آزمایشی پذیرش';
export const WALK_IN_FIXTURE_CLEANUP_REASON = 'HPM-004 Playwright walk-in fixture cleanup.';

type CleanupErrorCode =
  | 'UNSAFE_DATABASE_URL'
  | 'INVALID_REFERENCE'
  | 'INVALID_PHONE'
  | 'BOOKING_MISMATCH'
  | 'ASSIGNMENTS_PRESENT'
  | 'AUDIT_MISMATCH'
  | 'INVENTORY_MISMATCH';

export class WalkInFixtureCleanupError extends Error {
  constructor(readonly code: CleanupErrorCode) {
    super(code);
    this.name = 'WalkInFixtureCleanupError';
  }
}

export type WalkInFixtureCleanupResult = 'cancelled' | 'already-cleaned' | 'already-absent';

interface LockedBooking {
  id: string;
  room_type_id: string;
  status: string;
  guest_name: string;
  guest_phone: string;
  cancellation_reason: string | null;
  cancelled_at: Date | null;
}

interface LockedInventory {
  booked_rooms: number;
}

function cleanupError(code: CleanupErrorCode): WalkInFixtureCleanupError {
  return new WalkInFixtureCleanupError(code);
}

export function assertTestDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw cleanupError('UNSAFE_DATABASE_URL');

  try {
    const parsed = new URL(databaseUrl);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !databaseName.endsWith('_test')
    ) {
      throw cleanupError('UNSAFE_DATABASE_URL');
    }
  } catch (error) {
    if (error instanceof WalkInFixtureCleanupError) throw error;
    throw cleanupError('UNSAFE_DATABASE_URL');
  }

  return databaseUrl;
}

function assertInput(reference: string, guestPhone: string): void {
  if (!/^[A-Za-z0-9_-]{12,16}$/.test(reference)) throw cleanupError('INVALID_REFERENCE');
  if (!/^\+98915\d{7}$/.test(guestPhone)) throw cleanupError('INVALID_PHONE');
}

function hasStatusSnapshot(value: Prisma.JsonValue | null, status: string): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return value.status === status;
}

export async function cleanupWalkInFixture(
  prisma: PrismaClient,
  input: { reference: string; guestPhone: string },
): Promise<WalkInFixtureCleanupResult> {
  assertInput(input.reference, input.guestPhone);

  return prisma.$transaction(async (transaction) => {
    const bookings = await transaction.$queryRaw<LockedBooking[]>`
      SELECT
        id::text AS id,
        room_type_id::text AS room_type_id,
        status::text AS status,
        guest_name,
        guest_phone,
        cancellation_reason,
        cancelled_at
      FROM bookings
      WHERE public_reference = ${input.reference}
      FOR UPDATE
    `;

    if (bookings.length === 0) return 'already-absent';
    if (bookings.length !== 1) throw cleanupError('BOOKING_MISMATCH');

    const booking = bookings[0];
    if (
      booking.guest_name !== WALK_IN_FIXTURE_GUEST_NAME ||
      booking.guest_phone !== input.guestPhone
    ) {
      throw cleanupError('BOOKING_MISMATCH');
    }

    const assignmentCount = await transaction.roomAssignment.count({
      where: { bookingId: booking.id },
    });
    if (assignmentCount !== 0) throw cleanupError('ASSIGNMENTS_PRESENT');

    const cleanupEvents = await transaction.auditEvent.findMany({
      where: {
        eventName: 'BOOKING_TEST_FIXTURE_CLEANUP',
        targetType: 'BOOKING',
        targetId: booking.id,
      },
      select: { reason: true, before: true, after: true },
    });
    if (
      booking.status === 'CANCELLED' &&
      booking.cancellation_reason === WALK_IN_FIXTURE_CLEANUP_REASON &&
      booking.cancelled_at !== null &&
      cleanupEvents.length === 1 &&
      cleanupEvents[0].reason === WALK_IN_FIXTURE_CLEANUP_REASON &&
      hasStatusSnapshot(cleanupEvents[0].before, 'CONFIRMED') &&
      hasStatusSnapshot(cleanupEvents[0].after, 'CANCELLED')
    ) {
      return 'already-cleaned';
    }

    if (booking.status !== 'CONFIRMED' || cleanupEvents.length !== 0) {
      throw cleanupError('BOOKING_MISMATCH');
    }

    const walkInAuditCount = await transaction.auditEvent.count({
      where: {
        eventName: 'BOOKING_WALK_IN',
        targetType: 'BOOKING',
        targetId: booking.id,
      },
    });
    if (walkInAuditCount !== 1) throw cleanupError('AUDIT_MISMATCH');

    const nights = await transaction.bookingNight.findMany({
      where: { bookingId: booking.id },
      orderBy: { stayDate: 'asc' },
      select: { stayDate: true, roomQuantity: true },
    });
    if (nights.length === 0) throw cleanupError('INVENTORY_MISMATCH');

    for (const night of nights) {
      if (!Number.isInteger(night.roomQuantity) || night.roomQuantity < 1) {
        throw cleanupError('INVENTORY_MISMATCH');
      }
      const stayDate = night.stayDate.toISOString().slice(0, 10);
      const inventoryRows = await transaction.$queryRaw<LockedInventory[]>`
        SELECT booked_rooms
        FROM room_night_inventory
        WHERE room_type_id = ${booking.room_type_id}::uuid
          AND stay_date = ${stayDate}::date
        FOR UPDATE
      `;
      if (inventoryRows.length !== 1 || inventoryRows[0].booked_rooms < night.roomQuantity) {
        throw cleanupError('INVENTORY_MISMATCH');
      }

      const updated = await transaction.$executeRaw`
        UPDATE room_night_inventory
        SET booked_rooms = booked_rooms - ${night.roomQuantity}, updated_at = CURRENT_TIMESTAMP
        WHERE room_type_id = ${booking.room_type_id}::uuid
          AND stay_date = ${stayDate}::date
          AND booked_rooms >= ${night.roomQuantity}
      `;
      if (updated !== 1) throw cleanupError('INVENTORY_MISMATCH');
    }

    const databaseTimes = await transaction.$queryRaw<Array<{ now: Date }>>`
      SELECT CURRENT_TIMESTAMP AS now
    `;
    const now = databaseTimes[0]?.now;
    if (!(now instanceof Date)) throw cleanupError('INVENTORY_MISMATCH');

    const updatedBooking = await transaction.booking.updateMany({
      where: { id: booking.id, status: 'CONFIRMED' },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancellationReason: WALK_IN_FIXTURE_CLEANUP_REASON,
      },
    });
    if (updatedBooking.count !== 1) throw cleanupError('BOOKING_MISMATCH');

    await transaction.auditEvent.create({
      data: {
        eventName: 'BOOKING_TEST_FIXTURE_CLEANUP',
        targetType: 'BOOKING',
        targetId: booking.id,
        reason: WALK_IN_FIXTURE_CLEANUP_REASON,
        before: { status: 'CONFIRMED' },
        after: { status: 'CANCELLED' },
      },
    });

    return 'cancelled';
  });
}
