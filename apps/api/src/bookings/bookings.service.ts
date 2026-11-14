import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getHotelBusinessDate, parseAvailabilityCriteria } from '../availability/date-range';
import { assertGuestCapacity, calculateBookingTotal, hashBookingRequest } from './booking-rules';
import {
  canCancelConfirmedBooking,
  resolveBookingTransition,
  type BookingAction,
  type BookingStatus,
  type InventoryEffect,
} from './booking-lifecycle';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';

const IDEMPOTENCY_KEY_CONFLICT = {
  code: 'IDEMPOTENCY_KEY_REUSED',
  message: 'Use a new idempotency key when submitting different booking details.',
};

type LockedInventoryNight = {
  id: string;
  stayDate: string;
  totalRooms: number;
  heldRooms: number;
  bookedRooms: number;
  nightlyPriceToman: bigint;
};

type BookingRecord = {
  publicReference: string;
  status: string;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  roomQuantity: number;
  totalPriceToman: bigint;
  roomType: { slug: string; name: string };
  nights: Array<{
    stayDate: Date;
    nightlyPriceToman: bigint;
    roomQuantity: number;
    amountToman: bigint;
  }>;
};

export type StaffBookingAction = Exclude<BookingAction, 'EXPIRE'>;

export interface BookingTransitionOptions {
  internalNote?: string;
  cancellationReason?: string;
}

export interface BookingTransitionResult {
  reference: string;
  status: BookingStatus;
}

type LockedBooking = {
  id: string;
  publicReference: string;
  status: BookingStatus;
  checkIn: Date;
  expiresAt: Date;
  roomTypeId: string;
  roomQuantity: number;
};

type LockedInventoryCounter = {
  id: string;
  stayDate: string;
};

type DatabaseClock = { now: Date };

const bookingPublicSelect = {
  publicReference: true,
  status: true,
  checkIn: true,
  checkOut: true,
  guestCount: true,
  roomQuantity: true,
  totalPriceToman: true,
  roomType: { select: { slug: true, name: true } },
  nights: {
    orderBy: { stayDate: 'asc' as const },
    select: {
      stayDate: true,
      nightlyPriceToman: true,
      roomQuantity: true,
      amountToman: true,
    },
  },
} as const;

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBookingDto, idempotencyKey: string): Promise<BookingResponseDto> {
    const criteria = parseAvailabilityCriteria({
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      guests: dto.guestCount,
    });
    const requestHash = hashBookingRequest(dto);

    try {
      const booking = await this.prisma.$transaction(async (transaction) => {
        const initialReplay = await transaction.booking.findUnique({
          where: { idempotencyKey },
          select: { ...bookingPublicSelect, idempotencyRequestHash: true },
        });
        if (initialReplay) {
          return this.requireEquivalentReplay(initialReplay, requestHash);
        }

        const roomType = await transaction.roomType.findFirst({
          where: { slug: dto.roomTypeSlug, isActive: true },
          select: { id: true, slug: true, name: true, maxGuestsPerRoom: true },
        });
        if (!roomType) {
          throw new NotFoundException({
            code: 'ROOM_TYPE_NOT_FOUND',
            message: 'The selected room type is no longer available.',
          });
        }
        assertGuestCapacity(dto.guestCount, roomType.maxGuestsPerRoom, dto.roomQuantity);

        const inventory = await transaction.$queryRaw<LockedInventoryNight[]>`
          SELECT
            id::text AS id,
            to_char(stay_date, 'YYYY-MM-DD') AS "stayDate",
            total_rooms AS "totalRooms",
            held_rooms AS "heldRooms",
            booked_rooms AS "bookedRooms",
            nightly_price_toman AS "nightlyPriceToman"
          FROM room_night_inventory
          WHERE room_type_id = ${roomType.id}::uuid
            AND stay_date >= ${criteria.checkInDate}::date
            AND stay_date < ${criteria.checkOutDate}::date
          ORDER BY stay_date ASC
          FOR UPDATE
        `;

        // Another request using this key may have committed while this transaction waited
        // for the same inventory rows. Replaying here avoids reporting stale availability.
        const lockedReplay = await transaction.booking.findUnique({
          where: { idempotencyKey },
          select: { ...bookingPublicSelect, idempotencyRequestHash: true },
        });
        if (lockedReplay) {
          return this.requireEquivalentReplay(lockedReplay, requestHash);
        }

        if (
          inventory.length !== criteria.numberOfNights ||
          inventory.some(
            (night, index) =>
              night.stayDate !== criteria.stayDateStrings[index] ||
              night.totalRooms - night.heldRooms - night.bookedRooms < dto.roomQuantity ||
              night.nightlyPriceToman < 0n,
          )
        ) {
          throw this.availabilityChanged();
        }

        const nightlyPrices = inventory.map((night) => night.nightlyPriceToman);
        const totalPriceToman = calculateBookingTotal(nightlyPrices, dto.roomQuantity);
        for (const night of inventory) {
          await transaction.roomNightInventory.update({
            where: { id: night.id },
            data: { heldRooms: { increment: dto.roomQuantity } },
          });
        }

        return transaction.booking.create({
          data: {
            publicReference: randomBytes(9).toString('base64url'),
            idempotencyKey,
            idempotencyRequestHash: requestHash,
            status: 'PENDING_CONFIRMATION',
            checkIn: criteria.checkInDate,
            checkOut: criteria.checkOutDate,
            guestCount: dto.guestCount,
            roomTypeId: roomType.id,
            roomQuantity: dto.roomQuantity,
            guestName: dto.guestName,
            guestPhone: dto.guestPhone,
            guestEmail: dto.guestEmail,
            totalPriceToman,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            nights: {
              create: inventory.map((night) => ({
                stayDate: new Date(`${night.stayDate}T00:00:00.000Z`),
                nightlyPriceToman: night.nightlyPriceToman,
                roomQuantity: dto.roomQuantity,
                amountToman: night.nightlyPriceToman * BigInt(dto.roomQuantity),
              })),
            },
          },
          select: bookingPublicSelect,
        });
      });

      return this.toPublicResponse(booking);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const replay = await this.prisma.booking.findUnique({
          where: { idempotencyKey },
          select: { ...bookingPublicSelect, idempotencyRequestHash: true },
        });
        if (replay) {
          return this.toPublicResponse(this.requireEquivalentReplay(replay, requestHash));
        }
      }
      throw error;
    }
  }

  async transition(
    reference: string,
    action: StaffBookingAction,
    options: BookingTransitionOptions = {},
  ): Promise<BookingTransitionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const booking = await this.lockBookingByReference(transaction, reference);
      const decision = resolveBookingTransition(booking.status, action);
      if (!decision) {
        throw new ConflictException({
          code: 'BOOKING_STATUS_CONFLICT',
          message: 'The booking cannot be changed from its current status.',
        });
      }
      if (decision.idempotent) {
        return { reference: booking.publicReference, status: decision.nextStatus };
      }

      const now = await this.databaseNow(transaction);
      if (booking.status === 'PENDING_CONFIRMATION' && booking.expiresAt <= now) {
        throw new ConflictException({
          code: 'BOOKING_EXPIRED',
          message: 'The booking request has expired and can no longer be processed.',
        });
      }
      if (
        booking.status === 'CONFIRMED' &&
        action === 'CANCEL' &&
        !canCancelConfirmedBooking(
          booking.checkIn.toISOString().slice(0, 10),
          getHotelBusinessDate(now),
        )
      ) {
        throw new ConflictException({
          code: 'BOOKING_STAY_STARTED',
          message: 'A confirmed booking cannot be cancelled after check-in begins.',
        });
      }

      const internalNote = this.normalizeOptionalText(
        options.internalNote,
        1000,
        'INTERNAL_NOTE_INVALID',
      );
      const cancellationReason = this.normalizeOptionalText(
        options.cancellationReason,
        500,
        'CANCELLATION_REASON_INVALID',
      );
      if (booking.status === 'CONFIRMED' && action === 'CANCEL' && !cancellationReason) {
        throw new BadRequestException({
          code: 'CANCELLATION_REASON_REQUIRED',
          message: 'A cancellation reason is required for confirmed bookings.',
        });
      }

      await this.applyInventoryEffect(transaction, booking, decision.inventoryEffect);

      const updateData: {
        status: BookingStatus;
        confirmedAt?: Date;
        rejectedAt?: Date;
        cancelledAt?: Date;
        internalNote?: string;
        cancellationReason?: string;
      } = { status: decision.nextStatus };
      if (action === 'CONFIRM') updateData.confirmedAt = now;
      if (action === 'REJECT') updateData.rejectedAt = now;
      if (action === 'CANCEL') {
        updateData.cancelledAt = now;
        if (cancellationReason) updateData.cancellationReason = cancellationReason;
      }
      if (internalNote) updateData.internalNote = internalNote;
      await transaction.booking.update({ where: { id: booking.id }, data: updateData });

      return { reference: booking.publicReference, status: decision.nextStatus };
    });
  }

  async findDuePendingBookingIds(batchSize = 100): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id
      FROM bookings
      WHERE status = 'PENDING_CONFIRMATION'::booking_status
        AND expires_at <= clock_timestamp()
      ORDER BY expires_at ASC, id ASC
      LIMIT ${batchSize}
    `;
    return rows.map((row) => row.id);
  }

  async expirePending(bookingId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const booking = await this.lockBookingById(transaction, bookingId);
      if (!booking || booking.status !== 'PENDING_CONFIRMATION') return false;

      const now = await this.databaseNow(transaction);
      if (booking.expiresAt > now) return false;

      const decision = resolveBookingTransition(booking.status, 'EXPIRE');
      if (!decision || decision.idempotent) return false;
      await this.applyInventoryEffect(transaction, booking, decision.inventoryEffect);
      await transaction.booking.update({
        where: { id: booking.id },
        data: { status: decision.nextStatus, expiredAt: now },
      });
      return true;
    });
  }

  private async lockBookingByReference(
    transaction: Prisma.TransactionClient,
    reference: string,
  ): Promise<LockedBooking> {
    const rows = await transaction.$queryRaw<LockedBooking[]>`
      SELECT
        id::text AS id,
        public_reference AS "publicReference",
        status::text AS status,
        check_in AS "checkIn",
        expires_at AS "expiresAt",
        room_type_id::text AS "roomTypeId",
        room_quantity AS "roomQuantity"
      FROM bookings
      WHERE public_reference = ${reference}
      FOR UPDATE
    `;
    if (!rows[0]) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: 'The booking was not found.',
      });
    }
    return rows[0];
  }

  private async lockBookingById(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<LockedBooking | null> {
    const rows = await transaction.$queryRaw<LockedBooking[]>`
      SELECT
        id::text AS id,
        public_reference AS "publicReference",
        status::text AS status,
        check_in AS "checkIn",
        expires_at AS "expiresAt",
        room_type_id::text AS "roomTypeId",
        room_quantity AS "roomQuantity"
      FROM bookings
      WHERE id = ${id}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async databaseNow(transaction: Prisma.TransactionClient): Promise<Date> {
    const rows = await transaction.$queryRaw<DatabaseClock[]>`SELECT clock_timestamp() AS now`;
    return rows[0].now;
  }

  private async applyInventoryEffect(
    transaction: Prisma.TransactionClient,
    booking: LockedBooking,
    effect: InventoryEffect,
  ): Promise<void> {
    if (effect === 'NONE') return;

    const nights = await transaction.bookingNight.findMany({
      where: { bookingId: booking.id },
      orderBy: { stayDate: 'asc' },
      select: { stayDate: true, roomQuantity: true },
    });
    const inventory = await transaction.$queryRaw<LockedInventoryCounter[]>`
      SELECT
        inventory.id::text AS id,
        to_char(inventory.stay_date, 'YYYY-MM-DD') AS "stayDate"
      FROM room_night_inventory AS inventory
      INNER JOIN booking_nights AS booking_night
        ON booking_night.stay_date = inventory.stay_date
      WHERE booking_night.booking_id = ${booking.id}::uuid
        AND inventory.room_type_id = ${booking.roomTypeId}::uuid
      ORDER BY inventory.stay_date ASC
      FOR UPDATE OF inventory
    `;

    if (
      nights.length === 0 ||
      inventory.length !== nights.length ||
      nights.some(
        (night, index) =>
          night.stayDate.toISOString().slice(0, 10) !== inventory[index]?.stayDate ||
          night.roomQuantity !== booking.roomQuantity,
      )
    ) {
      throw new InternalServerErrorException('Booking inventory rows are inconsistent.');
    }

    for (const night of inventory) {
      const where =
        effect === 'HELD_TO_BOOKED' || effect === 'RELEASE_HELD'
          ? { id: night.id, heldRooms: { gte: booking.roomQuantity } }
          : { id: night.id, bookedRooms: { gte: booking.roomQuantity } };
      const data =
        effect === 'HELD_TO_BOOKED'
          ? {
              heldRooms: { decrement: booking.roomQuantity },
              bookedRooms: { increment: booking.roomQuantity },
            }
          : effect === 'RELEASE_HELD'
            ? { heldRooms: { decrement: booking.roomQuantity } }
            : { bookedRooms: { decrement: booking.roomQuantity } };
      const update = await transaction.roomNightInventory.updateMany({ where, data });
      if (update.count !== 1) {
        throw new InternalServerErrorException('Booking inventory counters are inconsistent.');
      }
    }
  }

  private normalizeOptionalText(
    value: string | undefined,
    maxLength: number,
    code: string,
  ): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim();
    if (normalized.length === 0) return undefined;
    if (normalized.length > maxLength) {
      throw new BadRequestException({
        code,
        message: 'The supplied note exceeds its maximum length.',
      });
    }
    return normalized;
  }

  private requireEquivalentReplay<T extends { idempotencyRequestHash: string | null }>(
    booking: T,
    requestHash: string,
  ): T {
    if (booking.idempotencyRequestHash !== requestHash) {
      throw new ConflictException(IDEMPOTENCY_KEY_CONFLICT);
    }
    return booking;
  }

  private toPublicResponse(booking: BookingRecord): BookingResponseDto {
    return {
      reference: booking.publicReference,
      status: booking.status,
      checkIn: booking.checkIn.toISOString().slice(0, 10),
      checkOut: booking.checkOut.toISOString().slice(0, 10),
      guestCount: booking.guestCount,
      roomQuantity: booking.roomQuantity,
      roomType: booking.roomType,
      priceSummary: {
        numberOfNights: booking.nights.length,
        totalPriceToman: booking.totalPriceToman.toString(),
        nights: booking.nights.map((night) => ({
          stayDate: night.stayDate.toISOString().slice(0, 10),
          nightlyPriceToman: night.nightlyPriceToman.toString(),
          roomQuantity: night.roomQuantity,
          amountToman: night.amountToman.toString(),
        })),
      },
    };
  }

  private availabilityChanged(): ConflictException {
    return new ConflictException({
      code: 'AVAILABILITY_CHANGED',
      message: 'Availability changed. Search again and review your stay before submitting.',
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
