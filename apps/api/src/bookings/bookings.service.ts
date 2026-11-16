import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getHotelBusinessDate, parseAvailabilityCriteria } from '../availability/date-range';
import { assertGuestCapacity, calculateBookingTotal, hashBookingRequest } from './booking-rules';
import {
  canCancelConfirmedBooking,
  resolveBookingTransition,
  type BookingAction,
  type BookingStatus,
  type InventoryEffect,
} from './booking-lifecycle';
import { RoomAssignmentService } from '../rooms/room-assignment.service';
import { hotelBusinessDate, RoomCapacityService } from '../rooms/room-capacity.service';
import type { StaffPrincipal } from '../staff-auth/staff-auth.types';
import { requireBookingIdempotencyKey } from './booking-idempotency-key';
import { lockBookingByReference, type LockedBooking } from './booking-row-lock';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';
import type { StaffStayMutationDto } from './dto/staff-stay-action.dto';
import { getStayArrivalWindow } from './stay-arrival-window';

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

export type StaffBookingAction = Exclude<BookingAction, 'EXPIRE' | 'CHECK_IN' | 'NO_SHOW'>;

export interface BookingTransitionOptions {
  internalNote?: string;
  cancellationReason?: string;
}

export interface BookingTransitionResult {
  reference: string;
  status: BookingStatus;
}

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

const stayMutationSelect = {
  publicReference: true,
  status: true,
  checkIn: true,
  checkOut: true,
  confirmedAt: true,
  checkedInAt: true,
  noShowAt: true,
} as const;

const bookingCreationSelect = { ...bookingPublicSelect, ...stayMutationSelect } as const;

type StayMutationRecord = Prisma.BookingGetPayload<{ select: typeof stayMutationSelect }>;
type StayActor = Pick<StaffPrincipal, 'id' | 'role'>;
type StayAction = Extract<BookingAction, 'CHECK_IN' | 'NO_SHOW'>;

function toStayMutationResponse(booking: StayMutationRecord): StaffStayMutationDto {
  return {
    reference: booking.publicReference,
    status: booking.status,
    checkIn: booking.checkIn.toISOString().slice(0, 10),
    checkOut: booking.checkOut.toISOString().slice(0, 10),
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    checkedInAt: booking.checkedInAt?.toISOString() ?? null,
    noShowAt: booking.noShowAt?.toISOString() ?? null,
  };
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assignments: RoomAssignmentService,
    private readonly capacity: RoomCapacityService,
  ) {}

  async create(dto: CreateBookingDto, idempotencyKey: string): Promise<BookingResponseDto> {
    return this.toPublicResponse(await this.reserve(dto, idempotencyKey));
  }

  async createWalkIn(
    dto: CreateBookingDto,
    idempotencyKey: string | undefined,
    actorStaffUserId: string,
  ): Promise<StaffStayMutationDto> {
    const key = requireBookingIdempotencyKey(idempotencyKey);
    return toStayMutationResponse(await this.reserve(dto, key, actorStaffUserId));
  }

  private async reserve(dto: CreateBookingDto, idempotencyKey: string, walkInActorId?: string) {
    const criteria = parseAvailabilityCriteria(
      { checkIn: dto.checkIn, checkOut: dto.checkOut, guests: dto.guestCount },
      walkInActorId ? dto.checkIn : undefined,
    );
    const requestHash = hashBookingRequest(dto, walkInActorId ? 'WALK_IN' : undefined);
    const replayQuery = {
      where: { idempotencyKey },
      select: { ...bookingCreationSelect, idempotencyRequestHash: true },
    } as const;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const initialReplay = await transaction.booking.findUnique(replayQuery);
        if (initialReplay) {
          return this.requireEquivalentReplay(initialReplay, requestHash);
        }

        const roomType = await transaction.roomType.findFirst({
          where: { slug: dto.roomTypeSlug, isActive: true },
          select: { id: true, maxGuestsPerRoom: true },
        });
        if (!roomType) {
          throw this.roomTypeUnavailable();
        }

        if (walkInActorId) await this.capacity.lockRoomType(transaction, roomType.id);
        else assertGuestCapacity(dto.guestCount, roomType.maxGuestsPerRoom, dto.roomQuantity);

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
        const lockedReplay = await transaction.booking.findUnique(replayQuery);
        if (lockedReplay) {
          return this.requireEquivalentReplay(lockedReplay, requestHash);
        }

        let confirmedAt: Date | undefined;
        if (walkInActorId) {
          const lockedType = await transaction.roomType.findUnique({
            where: { id: roomType.id, isActive: true },
            select: { maxGuestsPerRoom: true, hotel: { select: { timezone: true } } },
          });
          if (!lockedType) throw this.roomTypeUnavailable();
          assertGuestCapacity(dto.guestCount, lockedType.maxGuestsPerRoom, dto.roomQuantity);
          confirmedAt = await this.databaseNow(transaction);
          const businessDate = hotelBusinessDate(lockedType.hotel.timezone, confirmedAt);
          if (criteria.checkInDate.getTime() !== businessDate.getTime()) {
            throw new BadRequestException({
              code: 'WALK_IN_ARRIVAL_DATE_INVALID',
              message: "Walk-ins must arrive on the hotel's current business date.",
            });
          }
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
            data: walkInActorId
              ? { bookedRooms: { increment: dto.roomQuantity } }
              : { heldRooms: { increment: dto.roomQuantity } },
          });
        }

        const booking = await transaction.booking.create({
          data: {
            publicReference: randomBytes(9).toString('base64url'),
            idempotencyKey,
            idempotencyRequestHash: requestHash,
            status: walkInActorId ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
            confirmedAt,
            checkIn: criteria.checkInDate,
            checkOut: criteria.checkOutDate,
            guestCount: dto.guestCount,
            roomTypeId: roomType.id,
            roomQuantity: dto.roomQuantity,
            guestName: dto.guestName,
            guestPhone: dto.guestPhone,
            guestEmail: dto.guestEmail,
            totalPriceToman,
            expiresAt: confirmedAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
            nights: {
              create: inventory.map((night) => ({
                stayDate: new Date(`${night.stayDate}T00:00:00.000Z`),
                nightlyPriceToman: night.nightlyPriceToman,
                roomQuantity: dto.roomQuantity,
                amountToman: night.nightlyPriceToman * BigInt(dto.roomQuantity),
              })),
            },
          },
          select: { ...bookingCreationSelect, id: true },
        });
        if (walkInActorId) {
          await this.audit.record(transaction, {
            actorStaffUserId: walkInActorId,
            eventName: 'BOOKING_WALK_IN',
            targetType: 'BOOKING',
            targetId: booking.id,
            after: { status: booking.status },
          });
        }
        return booking;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const replay = await this.prisma.booking.findUnique(replayQuery);
        if (replay) {
          return this.requireEquivalentReplay(replay, requestHash);
        }
      }
      throw error;
    }
  }

  async checkIn(
    reference: string,
    actor: StayActor,
    rawReason?: string,
  ): Promise<StaffStayMutationDto> {
    const reason = this.normalizeOptionalText(rawReason, 500, 'EARLY_CHECK_IN_REASON_INVALID');
    return this.transitionStay(reference, 'CHECK_IN', actor, reason);
  }

  async noShow(
    reference: string,
    actor: StayActor,
    rawReason?: string,
  ): Promise<StaffStayMutationDto> {
    const reason = this.normalizeOptionalText(rawReason, 500, 'NO_SHOW_REASON_INVALID');
    if (!reason) {
      throw new BadRequestException({
        code: 'NO_SHOW_REASON_REQUIRED',
        message: 'A no-show reason is required.',
      });
    }
    return this.transitionStay(reference, 'NO_SHOW', actor, reason);
  }

  private async transitionStay(
    reference: string,
    action: StayAction,
    actor: StayActor,
    reason: string | undefined,
  ): Promise<StaffStayMutationDto> {
    return this.prisma.$transaction(async (transaction) => {
      const booking = await lockBookingByReference(transaction, reference);
      const decision = resolveBookingTransition(booking.status, action);
      if (!decision) throw this.statusConflict();

      if (!decision.idempotent) await this.assignments.lockAssignedRooms(transaction, booking);
      const stay = await transaction.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: {
          ...stayMutationSelect,
          noShowReason: true,
          roomType: { select: { hotel: { select: { timezone: true, checkInTime: true } } } },
        },
      });
      if (decision.idempotent) {
        if (action === 'NO_SHOW' && stay.noShowReason !== reason) throw this.statusConflict();
        return toStayMutationResponse(stay);
      }
      if (stay.status !== 'CONFIRMED') throw this.statusConflict();

      const now = await this.databaseNow(transaction);
      const { businessDate, window } = getStayArrivalWindow(
        now,
        stay.roomType.hotel,
        stay.checkIn,
        stay.checkOut,
      );
      if (window === 'OUTSIDE_STAY') {
        throw new ConflictException({
          code: 'STAY_OUTSIDE_ARRIVAL_WINDOW',
          message: 'This stay is not due for arrival on the current business date.',
        });
      }
      const isEarly = window === 'BEFORE_CHECK_IN_TIME';
      if (isEarly && action === 'NO_SHOW') {
        throw new ConflictException({
          code: 'NO_SHOW_TOO_EARLY',
          message: 'A no-show can be recorded from the configured arrival time.',
        });
      }
      if (isEarly) {
        if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
          throw new ForbiddenException({
            code: 'EARLY_CHECK_IN_FORBIDDEN',
            message: 'Only an administrator or manager can authorize an early check-in.',
          });
        }
        if (!reason) {
          throw new BadRequestException({
            code: 'EARLY_CHECK_IN_REASON_REQUIRED',
            message: 'An early check-in reason is required.',
          });
        }
      }

      if (action === 'CHECK_IN') {
        await this.assignments.assertCheckInReadiness(
          transaction,
          booking,
          businessDate,
          stay.checkOut,
        );
      } else {
        await this.applyInventoryEffect(transaction, booking, decision.inventoryEffect, {
          startDate: businessDate,
          endDate: stay.checkOut,
        });
        await this.assignments.deactivateForNoShow(transaction, booking.id);
      }

      const updated = await transaction.booking.update({
        where: { id: booking.id },
        data: {
          status: decision.nextStatus,
          ...(action === 'CHECK_IN'
            ? { checkedInAt: now, checkedInByStaffUserId: actor.id }
            : { noShowAt: now, noShowByStaffUserId: actor.id, noShowReason: reason }),
        },
        select: stayMutationSelect,
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: `BOOKING_${action}`,
        targetType: 'BOOKING',
        targetId: booking.id,
        reason: action === 'NO_SHOW' || isEarly ? reason : undefined,
        before: { status: stay.status },
        after: { status: updated.status },
      });
      return toStayMutationResponse(updated);
    });
  }

  async transition(
    reference: string,
    action: StaffBookingAction,
    options: BookingTransitionOptions = {},
    actorStaffUserId?: string,
  ): Promise<BookingTransitionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const booking = await lockBookingByReference(transaction, reference);
      const decision = resolveBookingTransition(booking.status, action);
      if (!decision) {
        throw this.statusConflict();
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

      if (booking.status === 'CONFIRMED' && action === 'CANCEL') {
        await this.assignments.releaseForCancellation(transaction, booking, actorStaffUserId);
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

      if (actorStaffUserId) {
        await this.audit.record(transaction, {
          actorStaffUserId,
          eventName: `BOOKING_${action}`,
          targetType: 'BOOKING',
          targetId: booking.id,
          ...(cancellationReason ? { reason: cancellationReason } : {}),
          before: { status: booking.status },
          after: { status: decision.nextStatus },
        });
      }

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
    range?: { startDate: Date; endDate: Date },
  ): Promise<void> {
    if (effect === 'NONE') return;

    const nights = await transaction.bookingNight.findMany({
      where: {
        bookingId: booking.id,
        stayDate: range ? { gte: range.startDate, lt: range.endDate } : undefined,
      },
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
        ${
          range
            ? Prisma.sql`AND inventory.stay_date >= ${range.startDate}::date
          AND inventory.stay_date < ${range.endDate}::date`
            : Prisma.empty
        }
      ORDER BY inventory.stay_date ASC
      FOR UPDATE OF inventory
    `;

    if (
      nights.length === 0 ||
      (range &&
        nights.length !== (range.endDate.getTime() - range.startDate.getTime()) / 86_400_000) ||
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
    if (value == null) return undefined;
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

  private roomTypeUnavailable(): NotFoundException {
    return new NotFoundException({
      code: 'ROOM_TYPE_NOT_FOUND',
      message: 'The selected room type is no longer available.',
    });
  }

  private statusConflict(): ConflictException {
    return new ConflictException({
      code: 'BOOKING_STATUS_CONFLICT',
      message: 'The booking cannot be changed from its current status.',
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
