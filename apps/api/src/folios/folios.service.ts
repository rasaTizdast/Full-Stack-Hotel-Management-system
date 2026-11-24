import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import type { StaffPrincipal, StaffRole } from '../staff-auth/staff-auth.types';
import { staffHasCapability } from '../staff-auth/staff-capabilities';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { addDays, parseDateOnly } from '../availability/date-range';
import type {
  AdjustFolioDto,
  CheckoutFolioDto,
  CreateServiceItemDto,
  RecordFolioPaymentDto,
  RefundFolioPaymentDto,
  StaffFolioPrintDto,
  PostServiceChargeDto,
  StaffFolioDto,
  UpdateServiceItemDto,
} from './dto/folio.dto';
import { calculateFolioBalance, withRunningBalances } from './folio-ledger';

const serviceItemSelect = {
  id: true,
  name: true,
  nameKey: true,
  category: true,
  currentPriceToman: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceItemSelect;

const folioSelect = {
  id: true,
  status: true,
  booking: {
    select: {
      id: true,
      publicReference: true,
      guestName: true,
      status: true,
      checkIn: true,
      checkOut: true,
      actualDepartureDate: true,
      assignments: {
        orderBy: [{ startDate: 'asc' as const }, { roomId: 'asc' as const }],
        select: {
          id: true,
          startDate: true,
          endDate: true,
          room: { select: { roomNumber: true } },
        },
      },
    },
  },
  entries: {
    orderBy: [{ entryNumber: 'asc' as const }],
    select: {
      id: true,
      direction: true,
      kind: true,
      amountToman: true,
      serviceDate: true,
      descriptionSnapshot: true,
      quantity: true,
      unitAmountToman: true,
      roomNumberSnapshot: true,
      correctsEntryId: true,
      correctionReason: true,
      paymentMethod: true,
      paymentReference: true,
      createdAt: true,
      actor: { select: { username: true } },
    },
  },
} satisfies Prisma.FolioSelect;

type ServiceItemRecord = Prisma.ServiceItemGetPayload<{ select: typeof serviceItemSelect }>;

export interface PostAccommodationNightInput {
  bookingId: string;
  roomAssignmentId: string;
  stayDate: Date;
  actorStaffUserId: string;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_TOMAN_AMOUNT = BigInt('9223372036854775807');

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function positiveBigInt(value: string): bigint {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > MAX_TOMAN_AMOUNT) {
    throw new BadRequestException({
      code: 'INVALID_TOMAN_AMOUNT',
      message: 'Amount must be a positive whole number of Toman.',
    });
  }
  return BigInt(value);
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function containsPaymentCardNumber(value: string): boolean {
  const digits = value
    .normalize('NFKC')
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 0xf))
    .replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function paymentDescription(method: RecordFolioPaymentDto['method']): string {
  switch (method) {
    case 'CASH':
      return 'دریافت نقدی';
    case 'BANK_TERMINAL':
      return 'دریافت از کارت‌خوان';
    case 'BANK_TRANSFER':
      return 'دریافت حواله بانکی';
    case 'OTHER':
      return 'دریافت از روش دیگر';
  }
}

function nameKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}

function toServiceItemDto(record: ServiceItemRecord) {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    currentPriceToman: record.currentPriceToman.toString(),
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function lockBookingAndFolio(
  transaction: Prisma.TransactionClient,
  bookingId: string,
): Promise<{ bookingId: string; folioId: string }> {
  const bookings = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE
  `;
  if (!bookings[0]) {
    throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'The stay was not found.' });
  }

  const folios = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM folios WHERE booking_id = ${bookingId}::uuid FOR UPDATE
  `;
  if (!folios[0]) {
    throw conflict('FOLIO_NOT_FOUND', 'This stay does not have a folio ledger.');
  }
  return { bookingId, folioId: folios[0].id };
}

@Injectable()
export class FoliosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listServiceItems(role: StaffRole) {
    const items = await this.prisma.serviceItem.findMany({
      where: staffHasCapability(role, 'MANAGE_SERVICE_CATALOG') ? {} : { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: serviceItemSelect,
    });
    return { items: items.map(toServiceItemDto) };
  }

  async createServiceItem(actor: StaffPrincipal, dto: CreateServiceItemDto) {
    const price = positiveBigInt(dto.currentPriceToman);
    const normalizedName = nameKey(dto.name);
    try {
      const record = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.serviceItem.create({
          data: {
            name: dto.name.trim(),
            nameKey: normalizedName,
            category: dto.category.trim(),
            currentPriceToman: price,
          },
          select: serviceItemSelect,
        });
        await this.audit.record(transaction, {
          actorStaffUserId: actor.id,
          eventName: 'SERVICE_ITEM_CREATED',
          targetType: 'SERVICE_ITEM',
          targetId: created.id,
          after: {
            serviceName: created.name,
            serviceCategory: created.category,
            currentPriceToman: created.currentPriceToman.toString(),
            isActive: created.isActive,
          },
        });
        return created;
      });
      return toServiceItemDto(record);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw conflict('SERVICE_ITEM_NAME_EXISTS', 'A service with this name already exists.');
      }
      throw error;
    }
  }

  async updateServiceItem(actor: StaffPrincipal, serviceItemId: string, dto: UpdateServiceItemDto) {
    const data: Prisma.ServiceItemUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      data.nameKey = nameKey(dto.name);
    }
    if (dto.category !== undefined) data.category = dto.category.trim();
    if (dto.currentPriceToman !== undefined) {
      data.currentPriceToman = positiveBigInt(dto.currentPriceToman);
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (!Object.keys(data).length) {
      throw new BadRequestException({ code: 'EMPTY_SERVICE_ITEM_UPDATE' });
    }

    try {
      const record = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT id FROM service_items WHERE id = ${serviceItemId}::uuid FOR UPDATE
        `;
        const before = await transaction.serviceItem.findUnique({
          where: { id: serviceItemId },
          select: serviceItemSelect,
        });
        if (!before) throw new NotFoundException({ code: 'SERVICE_ITEM_NOT_FOUND' });
        const updated = await transaction.serviceItem.update({
          where: { id: serviceItemId },
          data,
          select: serviceItemSelect,
        });
        await this.audit.record(transaction, {
          actorStaffUserId: actor.id,
          eventName: 'SERVICE_ITEM_UPDATED',
          targetType: 'SERVICE_ITEM',
          targetId: serviceItemId,
          before: {
            serviceName: before.name,
            serviceCategory: before.category,
            currentPriceToman: before.currentPriceToman.toString(),
            isActive: before.isActive,
          },
          after: {
            serviceName: updated.name,
            serviceCategory: updated.category,
            currentPriceToman: updated.currentPriceToman.toString(),
            isActive: updated.isActive,
          },
        });
        return updated;
      });
      return toServiceItemDto(record);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw conflict('SERVICE_ITEM_NAME_EXISTS', 'A service with this name already exists.');
      }
      throw error;
    }
  }

  async getFolio(bookingId: string, role: StaffRole): Promise<StaffFolioDto> {
    const record = await this.prisma.$transaction(
      (transaction) =>
        transaction.folio.findUnique({
          where: { bookingId },
          select: folioSelect,
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!record) throw new NotFoundException({ code: 'BOOKING_NOT_FOUND' });
    const running = withRunningBalances(
      record.entries.map((entry) => ({
        id: entry.id,
        direction: entry.direction,
        amountToman: entry.amountToman,
      })),
    );
    const balance = calculateFolioBalance(
      record.entries.map((entry) => ({
        direction: entry.direction,
        amountToman: entry.amountToman,
      })),
    );
    const canViewRoom = staffHasCapability(role, 'VIEW_FOLIO_ROOM_NUMBER');
    return {
      id: record.id,
      booking: {
        id: record.booking.id,
        reference: record.booking.publicReference,
        guestName: record.booking.guestName,
        status: record.booking.status,
        checkIn: dateString(record.booking.checkIn),
        checkOut: dateString(record.booking.checkOut),
        actualDepartureDate: record.booking.actualDepartureDate
          ? dateString(record.booking.actualDepartureDate)
          : null,
        assignments: record.booking.assignments.map((assignment) => ({
          id: assignment.id,
          roomNumber: canViewRoom ? assignment.room.roomNumber : null,
          startDate: dateString(assignment.startDate),
          endDate: dateString(assignment.endDate),
        })),
      },
      status: record.status,
      balanceToman: balance.toString(),
      entries: record.entries.map((entry, index) => ({
        id: entry.id,
        direction: entry.direction,
        kind: entry.kind,
        amountToman: entry.amountToman.toString(),
        serviceDate: dateString(entry.serviceDate),
        description: entry.descriptionSnapshot,
        roomNumber: canViewRoom ? entry.roomNumberSnapshot : null,
        quantity: entry.quantity,
        unitAmountToman: entry.unitAmountToman?.toString() ?? null,
        correctsEntryId: entry.correctsEntryId,
        correctionReason: entry.correctionReason,
        paymentMethod: entry.paymentMethod,
        paymentReference: entry.paymentReference,
        actorUsername: entry.actor?.username ?? null,
        balanceAfterToman: running[index].balanceAfterToman.toString(),
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  async getFolioPrint(bookingId: string, role: StaffRole): Promise<StaffFolioPrintDto> {
    const folio = await this.getFolio(bookingId, role);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, roomType: { select: { hotel: { select: { timezone: true } } } } },
    });
    if (!booking) throw new NotFoundException({ code: 'BOOKING_NOT_FOUND' });
    return {
      label: booking.status === 'CHECKED_OUT' ? 'Final folio' : 'Interim folio',
      printedAt: new Date().toISOString(),
      hotelTimezone: booking.roomType.hotel.timezone,
      folio,
    };
  }

  async postServiceCharge(
    actor: StaffPrincipal,
    bookingId: string,
    dto: PostServiceChargeDto,
    requestIdempotencyKey: string,
  ): Promise<StaffFolioDto> {
    const clientKey = this.validateIdempotencyKey(requestIdempotencyKey);
    const scopedKey = `service:${bookingId}:${clientKey}`;
    const requestHash = stableHash({
      serviceItemId: dto.serviceItemId,
      quantity: dto.quantity,
      serviceDate: dto.serviceDate,
      roomAssignmentId: dto.roomAssignmentId ?? null,
    });
    const serviceDate = parseDateOnly(dto.serviceDate);

    await this.prisma.$transaction(async (transaction) => {
      const locked = await lockBookingAndFolio(transaction, bookingId);
      const existing = await transaction.folioEntry.findUnique({
        where: { idempotencyKey: scopedKey },
        select: { folioId: true, requestHash: true },
      });
      if (existing) {
        if (existing.folioId !== locked.folioId || existing.requestHash !== requestHash) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'This idempotency key was already used for a different folio request.',
          );
        }
        return;
      }

      const booking = await transaction.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, checkIn: true, checkOut: true },
      });
      if (!booking) throw new NotFoundException({ code: 'BOOKING_NOT_FOUND' });
      this.assertOpenInHouseStay(booking.status, booking.checkIn, booking.checkOut, serviceDate);
      const businessDate = await this.currentBusinessDate(transaction, bookingId);
      if (serviceDate > businessDate) {
        throw conflict('SERVICE_DATE_IN_FUTURE', 'Services cannot be posted for a future date.');
      }

      const serviceItem = await transaction.serviceItem.findUnique({
        where: { id: dto.serviceItemId },
        select: { id: true, name: true, currentPriceToman: true, isActive: true },
      });
      if (!serviceItem || !serviceItem.isActive) {
        throw new NotFoundException({ code: 'ACTIVE_SERVICE_ITEM_NOT_FOUND' });
      }

      let roomAssignment: {
        id: string;
        room: { id: string; roomNumber: string };
      } | null = null;
      if (dto.roomAssignmentId) {
        roomAssignment = await transaction.roomAssignment.findFirst({
          where: {
            id: dto.roomAssignmentId,
            bookingId,
            startDate: { lte: serviceDate },
            endDate: { gt: serviceDate },
          },
          select: { id: true, room: { select: { id: true, roomNumber: true } } },
        });
        if (!roomAssignment) {
          throw conflict(
            'ROOM_ASSIGNMENT_NOT_VALID_FOR_DATE',
            'The selected room is not assigned to this stay on the service date.',
          );
        }
      }

      const amountToman = serviceItem.currentPriceToman * BigInt(dto.quantity);
      if (amountToman > MAX_TOMAN_AMOUNT) {
        throw new BadRequestException({ code: 'INVALID_TOMAN_AMOUNT' });
      }
      const created = await transaction.folioEntry.create({
        data: {
          folioId: locked.folioId,
          direction: 'DEBIT',
          kind: 'SERVICE',
          amountToman,
          serviceDate,
          descriptionSnapshot: serviceItem.name,
          quantity: dto.quantity,
          unitAmountToman: serviceItem.currentPriceToman,
          roomAssignmentId: roomAssignment?.id,
          roomNumberSnapshot: roomAssignment?.room.roomNumber,
          serviceItemId: serviceItem.id,
          source: 'SERVICE',
          idempotencyKey: scopedKey,
          requestHash,
          actorStaffUserId: actor.id,
        },
        select: { id: true },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'FOLIO_SERVICE_POSTED',
        targetType: 'FOLIO_ENTRY',
        targetId: created.id,
        after: {
          folioId: locked.folioId,
          serviceItemId: serviceItem.id,
          amountToman: amountToman.toString(),
          direction: 'DEBIT',
          entryKind: 'SERVICE',
          serviceDate: dto.serviceDate,
          roomId: roomAssignment?.room.id ?? null,
        },
      });
    });

    return this.getFolio(bookingId, actor.role);
  }

  async adjustFolio(
    actor: StaffPrincipal,
    bookingId: string,
    dto: AdjustFolioDto,
    requestIdempotencyKey: string,
  ): Promise<StaffFolioDto> {
    const clientKey = this.validateIdempotencyKey(requestIdempotencyKey);
    const scopedKey = `adjust:${bookingId}:${clientKey}`;
    const amountToman = positiveBigInt(dto.amountToman);
    const requestHash = stableHash({
      correctsEntryId: dto.correctsEntryId,
      amountToman: amountToman.toString(),
      reason: dto.reason.trim(),
    });

    await this.prisma.$transaction(async (transaction) => {
      const locked = await lockBookingAndFolio(transaction, bookingId);
      const existing = await transaction.folioEntry.findUnique({
        where: { idempotencyKey: scopedKey },
        select: { folioId: true, requestHash: true },
      });
      if (existing) {
        if (existing.folioId !== locked.folioId || existing.requestHash !== requestHash) {
          throw conflict('IDEMPOTENCY_KEY_REUSED', 'This key was used for another adjustment.');
        }
        return;
      }

      const booking = await transaction.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, checkIn: true, checkOut: true },
      });
      if (!booking || booking.status !== 'CHECKED_IN') {
        throw conflict(
          'STAY_NOT_IN_HOUSE',
          'Adjustments can only be posted during an active stay.',
        );
      }
      const original = await transaction.folioEntry.findFirst({
        where: { id: dto.correctsEntryId, folioId: locked.folioId, correctsEntryId: null },
        select: {
          id: true,
          direction: true,
          kind: true,
          amountToman: true,
          serviceDate: true,
          descriptionSnapshot: true,
          roomAssignmentId: true,
          roomNumberSnapshot: true,
        },
      });
      if (!original || original.kind === 'PAYMENT' || original.kind === 'REFUND') {
        throw new NotFoundException({ code: 'CORRECTABLE_FOLIO_ENTRY_NOT_FOUND' });
      }
      const alreadyCorrected = await transaction.folioEntry.aggregate({
        where: { correctsEntryId: original.id },
        _sum: { amountToman: true },
      });
      const remaining = original.amountToman - (alreadyCorrected._sum.amountToman ?? 0n);
      if (amountToman > remaining) {
        throw conflict(
          'CORRECTION_EXCEEDS_SOURCE',
          'The correction exceeds the uncorrected amount.',
        );
      }

      const created = await transaction.folioEntry.create({
        data: {
          folioId: locked.folioId,
          direction: original.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
          kind: 'ADJUSTMENT',
          amountToman,
          serviceDate: original.serviceDate,
          descriptionSnapshot: `اصلاح: ${original.descriptionSnapshot}`.slice(0, 500),
          roomAssignmentId: original.roomAssignmentId,
          roomNumberSnapshot: original.roomNumberSnapshot,
          source: 'ADJUSTMENT',
          idempotencyKey: scopedKey,
          requestHash,
          actorStaffUserId: actor.id,
          correctsEntryId: original.id,
          correctionReason: dto.reason.trim(),
        },
        select: { id: true },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'FOLIO_ENTRY_ADJUSTED',
        targetType: 'FOLIO_ENTRY',
        targetId: created.id,
        reason: dto.reason.trim(),
        after: {
          folioId: locked.folioId,
          correctsEntryId: original.id,
          amountToman: amountToman.toString(),
          direction: original.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
          entryKind: 'ADJUSTMENT',
          serviceDate: dateString(original.serviceDate),
          roomId: original.roomAssignmentId,
        },
      });
    });
    return this.getFolio(bookingId, actor.role);
  }

  async recordPayment(
    actor: StaffPrincipal,
    bookingId: string,
    dto: RecordFolioPaymentDto,
    requestIdempotencyKey: string,
  ): Promise<StaffFolioDto> {
    const clientKey = this.validateIdempotencyKey(requestIdempotencyKey);
    const scopedKey = `payment:${bookingId}:${clientKey}`;
    const amountToman = positiveBigInt(dto.amountToman);
    const reference = dto.reference?.trim() || undefined;
    if (reference && containsPaymentCardNumber(reference)) {
      throw new BadRequestException({
        code: 'CARD_DATA_NOT_ALLOWED',
        message: 'Cardholder data cannot be stored in a payment reference.',
      });
    }
    const requestHash = stableHash({
      amountToman: amountToman.toString(),
      method: dto.method,
      reference: reference ?? null,
    });

    await this.prisma.$transaction(async (transaction) => {
      const locked = await lockBookingAndFolio(transaction, bookingId);
      const existing = await transaction.folioEntry.findUnique({
        where: { idempotencyKey: scopedKey },
        select: { folioId: true, requestHash: true },
      });
      if (existing) {
        if (existing.folioId !== locked.folioId || existing.requestHash !== requestHash) {
          throw conflict('IDEMPOTENCY_KEY_REUSED', 'This key was used for another payment.');
        }
        return;
      }

      const folio = await transaction.folio.findUniqueOrThrow({
        where: { id: locked.folioId },
        select: { status: true },
      });
      const booking = await transaction.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { status: true },
      });
      if (!(
        (folio.status === 'OPEN' && booking.status === 'CHECKED_IN') ||
        (folio.status === 'CLOSED_DUE' && booking.status === 'CHECKED_OUT')
      )) {
        throw conflict('FOLIO_NOT_COLLECTIBLE', 'This folio cannot accept a payment.');
      }

      const balance = await this.folioBalance(transaction, locked.folioId);
      if (balance <= 0n) {
        throw conflict('FOLIO_HAS_NO_POSITIVE_BALANCE', 'There is no positive balance to collect.');
      }
      if (amountToman > balance) {
        throw conflict(
          'FOLIO_PAYMENT_EXCEEDS_BALANCE',
          'A payment cannot exceed the folio balance.',
        );
      }
      const serviceDate = await this.currentBusinessDate(transaction, bookingId);
      const entry = await transaction.folioEntry.create({
        data: {
          folioId: locked.folioId,
          direction: 'CREDIT',
          kind: 'PAYMENT',
          amountToman,
          serviceDate,
          descriptionSnapshot: paymentDescription(dto.method),
          paymentMethod: dto.method,
          paymentReference: reference,
          source: 'PAYMENT',
          idempotencyKey: scopedKey,
          requestHash,
          actorStaffUserId: actor.id,
        },
        select: { id: true },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'FOLIO_PAYMENT_RECORDED',
        targetType: 'FOLIO_ENTRY',
        targetId: entry.id,
        after: {
          folioId: locked.folioId,
          amountToman: amountToman.toString(),
          direction: 'CREDIT',
          entryKind: 'PAYMENT',
          paymentMethod: dto.method,
          serviceDate: dateString(serviceDate),
        },
      });

      if (folio.status === 'CLOSED_DUE' && balance - amountToman === 0n) {
        await transaction.folio.update({
          where: { id: locked.folioId },
          data: { status: 'CLOSED' },
        });
      }
    });

    return this.getFolio(bookingId, actor.role);
  }

  async refundPayment(
    actor: StaffPrincipal,
    bookingId: string,
    dto: RefundFolioPaymentDto,
    requestIdempotencyKey: string,
  ): Promise<StaffFolioDto> {
    if (!staffHasCapability(actor.role, 'ADJUST_FOLIOS')) {
      throw new ForbiddenException({ code: 'FOLIO_REFUND_FORBIDDEN' });
    }
    const clientKey = this.validateIdempotencyKey(requestIdempotencyKey);
    const scopedKey = `refund:${bookingId}:${clientKey}`;
    const amountToman = positiveBigInt(dto.amountToman);
    const reason = dto.reason.trim();
    const requestHash = stableHash({
      paymentEntryId: dto.paymentEntryId,
      amountToman: amountToman.toString(),
      reason,
    });

    await this.prisma.$transaction(async (transaction) => {
      const locked = await lockBookingAndFolio(transaction, bookingId);
      const existing = await transaction.folioEntry.findUnique({
        where: { idempotencyKey: scopedKey },
        select: { folioId: true, requestHash: true },
      });
      if (existing) {
        if (existing.folioId !== locked.folioId || existing.requestHash !== requestHash) {
          throw conflict('IDEMPOTENCY_KEY_REUSED', 'This key was used for another refund.');
        }
        return;
      }

      const folio = await transaction.folio.findUniqueOrThrow({
        where: { id: locked.folioId },
        select: { status: true },
      });
      const original = await transaction.folioEntry.findFirst({
        where: {
          id: dto.paymentEntryId,
          folioId: locked.folioId,
          kind: 'PAYMENT',
          direction: 'CREDIT',
          correctsEntryId: null,
        },
        select: { id: true, amountToman: true, serviceDate: true },
      });
      if (!original) {
        throw new NotFoundException({ code: 'SOURCE_PAYMENT_NOT_FOUND' });
      }
      const refunded = await transaction.folioEntry.aggregate({
        where: { folioId: locked.folioId, kind: 'REFUND', correctsEntryId: original.id },
        _sum: { amountToman: true },
      });
      const remaining = original.amountToman - (refunded._sum.amountToman ?? 0n);
      if (amountToman > remaining) {
        throw conflict(
          'REFUND_EXCEEDS_SOURCE_PAYMENT',
          'The refund exceeds the unrefunded payment.',
        );
      }

      const serviceDate = await this.currentBusinessDate(transaction, bookingId);
      const refund = await transaction.folioEntry.create({
        data: {
          folioId: locked.folioId,
          direction: 'DEBIT',
          kind: 'REFUND',
          amountToman,
          serviceDate,
          descriptionSnapshot: 'استرداد پرداخت',
          source: 'REFUND',
          idempotencyKey: scopedKey,
          requestHash,
          actorStaffUserId: actor.id,
          correctsEntryId: original.id,
          correctionReason: reason,
        },
        select: { id: true },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'FOLIO_PAYMENT_REFUNDED',
        targetType: 'FOLIO_ENTRY',
        targetId: refund.id,
        reason,
        after: {
          folioId: locked.folioId,
          correctsEntryId: original.id,
          amountToman: amountToman.toString(),
          direction: 'DEBIT',
          entryKind: 'REFUND',
          serviceDate: dateString(serviceDate),
        },
      });

      if (folio.status !== 'OPEN') {
        const balance = await this.folioBalance(transaction, locked.folioId);
        await transaction.folio.update({
          where: { id: locked.folioId },
          data: { status: balance > 0n ? 'CLOSED_DUE' : 'CLOSED' },
        });
      }
    });

    return this.getFolio(bookingId, actor.role);
  }

  async checkout(
    actor: StaffPrincipal,
    bookingId: string,
    dto: CheckoutFolioDto,
    requestIdempotencyKey: string,
  ): Promise<StaffFolioDto> {
    const clientKey = this.validateIdempotencyKey(requestIdempotencyKey);
    const scopedKey = `checkout:${bookingId}:${clientKey}`;
    const onAccountReason = dto.onAccountReason?.trim() || undefined;
    const requestHash = stableHash({ onAccountReason: onAccountReason ?? null });

    await this.prisma.$transaction(async (transaction) => {
      const locked = await lockBookingAndFolio(transaction, bookingId);
      const folio = await transaction.folio.findUniqueOrThrow({
        where: { id: locked.folioId },
        select: {
          status: true,
          checkoutIdempotencyKey: true,
          checkoutRequestHash: true,
        },
      });
      if (folio.checkoutIdempotencyKey) {
        if (
          folio.checkoutIdempotencyKey === scopedKey &&
          folio.checkoutRequestHash === requestHash
        ) {
          return;
        }
        throw conflict('STAY_ALREADY_CHECKED_OUT', 'This stay has already been checked out.');
      }
      if (folio.status !== 'OPEN') {
        throw conflict('FOLIO_NOT_OPEN', 'This folio has already been closed.');
      }
      if (onAccountReason && actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
        throw new ForbiddenException({ code: 'ON_ACCOUNT_CHECKOUT_FORBIDDEN' });
      }

      const booking = await transaction.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: {
          status: true,
          checkIn: true,
          checkOut: true,
          roomQuantity: true,
          roomTypeId: true,
          roomType: { select: { hotel: { select: { businessDate: true } } } },
        },
      });
      if (booking.status !== 'CHECKED_IN') {
        throw conflict('STAY_NOT_IN_HOUSE', 'Only an in-house stay can be checked out.');
      }

      const now = await this.databaseNow(transaction);
      const departureDate = booking.roomType.hotel.businessDate;
      if (departureDate < booking.checkIn) {
        throw conflict(
          'CHECKOUT_BEFORE_CHECK_IN',
          'The stay cannot be checked out before arrival.',
        );
      }
      if (departureDate > booking.checkOut) {
        throw conflict(
          'STAY_EXTENSION_REQUIRED',
          'The scheduled stay must be extended before checkout.',
        );
      }
      const chargeEndDate = departureDate < booking.checkOut ? departureDate : booking.checkOut;
      const assignments = await transaction.roomAssignment.findMany({
        where: { bookingId },
        orderBy: [{ startDate: 'asc' }, { roomId: 'asc' }, { id: 'asc' }],
        select: { id: true, roomId: true, startDate: true, endDate: true, isActive: true },
      });
      const activeAssignments = assignments.filter((assignment) => assignment.isActive);
      if (
        activeAssignments.length !== booking.roomQuantity ||
        new Set(activeAssignments.map((assignment) => assignment.roomId)).size !==
          booking.roomQuantity
      ) {
        throw conflict(
          'ROOM_ASSIGNMENT_REQUIRED',
          'The in-house stay must have one active room per booked unit.',
        );
      }

      await transaction.$queryRaw`SELECT id FROM room_types WHERE id = ${booking.roomTypeId}::uuid FOR UPDATE`;
      for (const roomId of [
        ...new Set(assignments.map((assignment) => assignment.roomId)),
      ].sort()) {
        await transaction.$queryRaw`SELECT id FROM rooms WHERE id = ${roomId}::uuid FOR UPDATE`;
      }

      for (
        let stayDate = booking.checkIn;
        stayDate < chargeEndDate;
        stayDate = parseDateOnly(addDays(dateString(stayDate), 1))
      ) {
        const covering = assignments.filter(
          (assignment) => assignment.startDate <= stayDate && assignment.endDate > stayDate,
        );
        const distinctRooms = new Map(
          covering.map((assignment) => [assignment.roomId, assignment]),
        );
        if (distinctRooms.size !== booking.roomQuantity) {
          throw conflict(
            'ROOM_ASSIGNMENT_INCOMPLETE',
            'Assigned rooms must cover every charged night of the stay.',
          );
        }
        for (const assignment of distinctRooms.values()) {
          await this.postAccommodationNight(transaction, {
            bookingId,
            roomAssignmentId: assignment.id,
            stayDate,
            actorStaffUserId: actor.id,
          });
        }
      }

      if (departureDate < booking.checkOut) {
        const releaseDates: Date[] = [];
        for (
          let stayDate = departureDate;
          stayDate < booking.checkOut;
          stayDate = parseDateOnly(addDays(dateString(stayDate), 1))
        ) {
          releaseDates.push(stayDate);
        }
        const lockedInventory = await transaction.$queryRaw<Array<{ stayDate: Date }>>`
          SELECT stay_date AS "stayDate"
          FROM room_night_inventory
          WHERE room_type_id = ${booking.roomTypeId}::uuid
            AND stay_date >= ${departureDate}::date
            AND stay_date < ${booking.checkOut}::date
          ORDER BY stay_date
          FOR UPDATE
        `;
        if (lockedInventory.length !== releaseDates.length) {
          throw conflict('INVENTORY_NIGHT_NOT_FOUND', 'Future inventory is missing for this stay.');
        }
        for (const stayDate of releaseDates) {
          const updated = await transaction.roomNightInventory.updateMany({
            where: {
              roomTypeId: booking.roomTypeId,
              stayDate,
              bookedRooms: { gte: booking.roomQuantity },
            },
            data: { bookedRooms: { decrement: booking.roomQuantity } },
          });
          if (updated.count !== 1) {
            throw conflict(
              'BOOKED_INVENTORY_MISMATCH',
              'Future booked inventory could not be released.',
            );
          }
        }
      }

      const balance = await this.folioBalance(transaction, locked.folioId);
      if (balance < 0n) {
        throw conflict(
          'FOLIO_CREDIT_REQUIRES_REFUND',
          'A credit balance must be resolved with a reasoned refund before checkout.',
        );
      }
      if (balance > 0n) {
        if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
          throw conflict(
            'FOLIO_BALANCE_NOT_SETTLED',
            'Ordinary checkout requires the folio balance to be zero.',
          );
        }
        if (!onAccountReason) {
          throw new BadRequestException({
            code: 'ON_ACCOUNT_REASON_REQUIRED',
            message: 'A reason is required to check out with a receivable balance.',
          });
        }
      }

      const roomIds = [...new Set(activeAssignments.map((assignment) => assignment.roomId))];
      await transaction.room.updateMany({
        where: { id: { in: roomIds } },
        data: { housekeepingStatus: 'DIRTY' },
      });
      await transaction.roomAssignment.updateMany({
        where: { bookingId, isActive: true },
        data: { isActive: false },
      });
      const folioStatus = balance === 0n ? 'CLOSED' : 'CLOSED_DUE';
      await transaction.folio.update({
        where: { id: locked.folioId },
        data: {
          status: folioStatus,
          closedAt: now,
          closedByStaffUserId: actor.id,
          checkoutIdempotencyKey: scopedKey,
          checkoutRequestHash: requestHash,
        },
      });
      await transaction.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CHECKED_OUT',
          checkedOutAt: now,
          checkedOutByStaffUserId: actor.id,
          ...(departureDate < booking.checkOut && departureDate > booking.checkIn
            ? { checkOut: departureDate }
            : {}),
          actualDepartureDate: departureDate,
        },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'BOOKING_CHECKED_OUT',
        targetType: 'BOOKING',
        targetId: bookingId,
        ...(onAccountReason ? { reason: onAccountReason } : {}),
        before: { status: 'CHECKED_IN', checkOut: dateString(booking.checkOut) },
        after: {
          status: 'CHECKED_OUT',
          checkOut: dateString(
            departureDate < booking.checkOut && departureDate > booking.checkIn
              ? departureDate
              : booking.checkOut,
          ),
          actualDepartureDate: dateString(departureDate),
          folioId: locked.folioId,
          amountToman: balance.toString(),
          roomQuantity: booking.roomQuantity,
        },
      });
    });

    return this.getFolio(bookingId, actor.role);
  }

  private async folioBalance(
    transaction: Prisma.TransactionClient,
    folioId: string,
  ): Promise<bigint> {
    const entries = await transaction.folioEntry.findMany({
      where: { folioId },
      select: { direction: true, amountToman: true },
    });
    return calculateFolioBalance(entries);
  }

  private async databaseNow(transaction: Prisma.TransactionClient): Promise<Date> {
    const rows = await transaction.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    return rows[0].now;
  }

  async postAccommodationNight(
    transaction: Prisma.TransactionClient,
    input: PostAccommodationNightInput,
  ): Promise<{ id: string; amountToman: bigint; idempotent: boolean }> {
    const stayDate = input.stayDate;
    const key = `room-night:${input.roomAssignmentId}:${dateString(stayDate)}`;
    const locked = await lockBookingAndFolio(transaction, input.bookingId);
    const prior = await transaction.folioEntry.findUnique({
      where: { idempotencyKey: key },
      select: {
        id: true,
        folioId: true,
        amountToman: true,
        roomAssignmentId: true,
        serviceDate: true,
      },
    });
    if (prior) {
      if (
        prior.folioId !== locked.folioId ||
        prior.roomAssignmentId !== input.roomAssignmentId ||
        dateString(prior.serviceDate) !== dateString(stayDate)
      ) {
        throw conflict(
          'ROOM_NIGHT_KEY_CONFLICT',
          'The room-night posting key belongs to another line.',
        );
      }
      return { id: prior.id, amountToman: prior.amountToman, idempotent: true };
    }

    const booking = await transaction.booking.findUnique({
      where: { id: input.bookingId },
      select: { id: true, status: true, checkIn: true, checkOut: true, roomTypeId: true },
    });
    if (!booking) throw new NotFoundException({ code: 'BOOKING_NOT_FOUND' });
    this.assertOpenInHouseStay(booking.status, booking.checkIn, booking.checkOut, stayDate);
    if (stayDate > (await this.currentBusinessDate(transaction, input.bookingId))) {
      throw conflict(
        'SERVICE_DATE_IN_FUTURE',
        'Accommodation cannot be posted for a future night.',
      );
    }
    const assignment = await transaction.roomAssignment.findFirst({
      where: {
        id: input.roomAssignmentId,
        bookingId: input.bookingId,
        startDate: { lte: stayDate },
        endDate: { gt: stayDate },
      },
      select: { id: true, room: { select: { id: true, roomNumber: true } } },
    });
    if (!assignment) {
      throw conflict(
        'ROOM_ASSIGNMENT_NOT_VALID_FOR_DATE',
        'No active assigned room covers this night.',
      );
    }
    const night = await transaction.bookingNight.findUnique({
      where: { bookingId_stayDate: { bookingId: input.bookingId, stayDate } },
      select: { nightlyPriceToman: true },
    });
    if (!night || night.nightlyPriceToman <= 0n) {
      throw conflict('BOOKING_NIGHT_NOT_FOUND', 'The stay has no stored rate for this night.');
    }
    const created = await transaction.folioEntry.create({
      data: {
        folioId: locked.folioId,
        direction: 'DEBIT',
        kind: 'ACCOMMODATION',
        amountToman: night.nightlyPriceToman,
        serviceDate: stayDate,
        descriptionSnapshot: `هزینه اقامت - اتاق ${assignment.room.roomNumber}`,
        quantity: 1,
        unitAmountToman: night.nightlyPriceToman,
        roomAssignmentId: assignment.id,
        roomNumberSnapshot: assignment.room.roomNumber,
        source: 'ROOM_NIGHT',
        idempotencyKey: key,
        actorStaffUserId: input.actorStaffUserId,
      },
      select: { id: true, amountToman: true },
    });
    await this.audit.record(transaction, {
      actorStaffUserId: input.actorStaffUserId,
      eventName: 'FOLIO_ROOM_NIGHT_POSTED',
      targetType: 'FOLIO_ENTRY',
      targetId: created.id,
      after: {
        folioId: locked.folioId,
        amountToman: created.amountToman.toString(),
        direction: 'DEBIT',
        entryKind: 'ACCOMMODATION',
        serviceDate: dateString(stayDate),
        roomId: assignment.room.id,
      },
    });
    return { id: created.id, amountToman: created.amountToman, idempotent: false };
  }

  private async currentBusinessDate(
    transaction: Prisma.TransactionClient,
    bookingId: string,
  ): Promise<Date> {
    const booking = await transaction.booking.findUnique({
      where: { id: bookingId },
      select: { roomType: { select: { hotel: { select: { businessDate: true } } } } },
    });
    if (!booking) throw new NotFoundException({ code: 'BOOKING_NOT_FOUND' });
    return booking.roomType.hotel.businessDate;
  }

  private assertOpenInHouseStay(
    status: string,
    checkIn: Date,
    checkOut: Date,
    serviceDate: Date,
  ): void {
    if (status !== 'CHECKED_IN') {
      throw conflict('STAY_NOT_IN_HOUSE', 'Charges can only be posted to an in-house stay.');
    }
    if (serviceDate < checkIn || serviceDate >= checkOut) {
      throw conflict(
        'SERVICE_DATE_OUTSIDE_STAY',
        'The service date must be inside the stay, including check-in and excluding checkout.',
      );
    }
  }

  private validateIdempotencyKey(key: string | undefined): string {
    if (!key || !IDEMPOTENCY_KEY.test(key)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Send an Idempotency-Key with 8 to 128 letters, numbers, or . _ : - characters.',
      });
    }
    return key;
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
