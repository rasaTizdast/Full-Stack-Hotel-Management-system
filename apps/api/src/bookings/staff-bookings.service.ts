import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { StaffBookingAction, BookingTransitionOptions } from './bookings.service';
import { BookingsService } from './bookings.service';
import { StaffBookingsQueryDto } from './dto/staff-bookings-query.dto';
import type {
  StaffBookingDetailDto,
  StaffBookingListDto,
  StaffBookingListItemDto,
} from './dto/staff-booking-response.dto';

const bookingListSelect = {
  publicReference: true,
  status: true,
  checkIn: true,
  checkOut: true,
  guestCount: true,
  roomQuantity: true,
  guestName: true,
  guestPhone: true,
  createdAt: true,
  expiresAt: true,
  roomType: { select: { slug: true, name: true } },
} as const;

const bookingDetailSelect = {
  ...bookingListSelect,
  guestEmail: true,
  totalPriceToman: true,
  internalNote: true,
  cancellationReason: true,
  confirmedAt: true,
  rejectedAt: true,
  cancelledAt: true,
  expiredAt: true,
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

type BookingListRecord = Prisma.BookingGetPayload<{ select: typeof bookingListSelect }>;
type BookingDetailRecord = Prisma.BookingGetPayload<{ select: typeof bookingDetailSelect }>;

function invalidDateRange(): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_DATE_RANGE',
    message: 'Use valid Gregorian YYYY-MM-DD arrival dates.',
  });
}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw invalidDateRange();
  }
  return date;
}

function normalizePhoneSearchTerm(value: string): string | undefined {
  const digits = value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\s()-]/g, '');
  if (!/^\+?\d+$/.test(digits)) return undefined;
  if (digits.startsWith('+98')) return digits;
  if (digits.startsWith('0098')) return `+${digits.slice(2)}`;
  if (digits.startsWith('98')) return `+${digits}`;
  if (digits.startsWith('0')) return `+98${digits.slice(1)}`;
  if (digits.startsWith('9')) return `+98${digits}`;
  return digits;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toListItem(record: BookingListRecord): StaffBookingListItemDto {
  return {
    reference: record.publicReference,
    status: record.status,
    checkIn: dateOnly(record.checkIn),
    checkOut: dateOnly(record.checkOut),
    guestCount: record.guestCount,
    roomQuantity: record.roomQuantity,
    guestName: record.guestName,
    guestPhone: record.guestPhone,
    roomType: record.roomType,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

function toDetail(record: BookingDetailRecord): StaffBookingDetailDto {
  return {
    ...toListItem(record),
    guestEmail: record.guestEmail,
    totalPriceToman: record.totalPriceToman.toString(),
    internalNote: record.internalNote,
    cancellationReason: record.cancellationReason,
    statusTimestamps: {
      confirmedAt: record.confirmedAt?.toISOString() ?? null,
      rejectedAt: record.rejectedAt?.toISOString() ?? null,
      cancelledAt: record.cancelledAt?.toISOString() ?? null,
      expiredAt: record.expiredAt?.toISOString() ?? null,
    },
    nights: record.nights.map((night) => ({
      stayDate: dateOnly(night.stayDate),
      nightlyPriceToman: night.nightlyPriceToman.toString(),
      roomQuantity: night.roomQuantity,
      amountToman: night.amountToman.toString(),
    })),
  };
}

@Injectable()
export class StaffBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

  async list(query: StaffBookingsQueryDto): Promise<StaffBookingListDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.BookingWhereInput = {};

    if (query.status) where.status = query.status;

    const arrivalFrom = query.arrivalFrom ? parseDateOnly(query.arrivalFrom) : undefined;
    const arrivalTo = query.arrivalTo ? parseDateOnly(query.arrivalTo) : undefined;
    if (arrivalFrom && arrivalTo && arrivalFrom > arrivalTo) throw invalidDateRange();
    if (arrivalFrom || arrivalTo) {
      where.checkIn = {
        ...(arrivalFrom ? { gte: arrivalFrom } : {}),
        ...(arrivalTo ? { lte: arrivalTo } : {}),
      };
    }

    const search = query.search?.trim();
    if (search) {
      const searchTerms: Prisma.BookingWhereInput[] = [{ publicReference: { contains: search } }];
      const phoneTerm = normalizePhoneSearchTerm(search);
      if (phoneTerm) searchTerms.push({ guestPhone: { contains: phoneTerm } });
      where.OR = searchTerms;
    }

    const [records, totalItems] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: bookingListSelect,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      items: records.map(toListItem),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async get(reference: string): Promise<StaffBookingDetailDto> {
    const record = await this.prisma.booking.findUnique({
      where: { publicReference: reference },
      select: bookingDetailSelect,
    });
    if (!record) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: 'The booking was not found.',
      });
    }
    return toDetail(record);
  }

  async transition(
    reference: string,
    action: StaffBookingAction,
    options: BookingTransitionOptions = {},
  ): Promise<StaffBookingDetailDto> {
    await this.bookings.transition(reference, action, options);
    return this.get(reference);
  }
}
