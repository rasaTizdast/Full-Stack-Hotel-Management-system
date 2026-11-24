import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { HOTEL_TIME_ZONE, parseDateOnly } from '../availability/date-range';
import { PrismaService } from '../database/prisma.service';
import { hotelBusinessDate } from '../rooms/room-capacity.service';
import { StaffStayQueryDto } from './dto/staff-stay-query.dto';
import type { StaffStayWorklistDto, StaffStayWorklistItemDto } from './dto/staff-stay-response.dto';

type WorklistKind = 'ARRIVALS' | 'IN_HOUSE' | 'DEPARTURES';

const worklistSelect = {
  publicReference: true,
  status: true,
  guestName: true,
  checkIn: true,
  checkOut: true,
  roomQuantity: true,
  confirmedAt: true,
  checkedInAt: true,
  roomType: { select: { id: true, name: true } },
  assignments: {
    where: { isActive: true },
    orderBy: [{ startDate: 'asc' }, { roomId: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      startDate: true,
      endDate: true,
      room: { select: { roomNumber: true, housekeepingStatus: true } },
    },
  },
} satisfies Prisma.BookingSelect;

type WorklistRecord = Prisma.BookingGetPayload<{ select: typeof worklistSelect }>;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function escapeLikeWildcards(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function toWorklistItem(record: WorklistRecord): StaffStayWorklistItemDto {
  return {
    reference: record.publicReference,
    status: record.status as 'CONFIRMED' | 'CHECKED_IN',
    guestName: record.guestName,
    checkIn: dateOnly(record.checkIn),
    checkOut: dateOnly(record.checkOut),
    roomQuantity: record.roomQuantity,
    roomType: record.roomType,
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
    checkedInAt: record.checkedInAt?.toISOString() ?? null,
    assignedRooms: record.assignments.map((assignment) => ({
      assignmentId: assignment.id,
      roomNumber: assignment.room.roomNumber,
      housekeepingStatus: assignment.room.housekeepingStatus,
      startDate: dateOnly(assignment.startDate),
      endDate: dateOnly(assignment.endDate),
    })),
  };
}

@Injectable()
export class StaffStaysService {
  constructor(private readonly prisma: PrismaService) {}

  arrivals(query: StaffStayQueryDto): Promise<StaffStayWorklistDto> {
    return this.list('ARRIVALS', query);
  }

  inHouse(query: StaffStayQueryDto): Promise<StaffStayWorklistDto> {
    return this.list('IN_HOUSE', query);
  }

  departures(query: StaffStayQueryDto): Promise<StaffStayWorklistDto> {
    return this.list('DEPARTURES', query);
  }

  private async list(kind: WorklistKind, query: StaffStayQueryDto): Promise<StaffStayWorklistDto> {
    const hotel = await this.prisma.hotel.findFirst({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, businessDate: true },
    });
    const businessDate = hotel?.businessDate ?? hotelBusinessDate(HOTEL_TIME_ZONE);
    const selectedDate = query.date ? parseDateOnly(query.date) : businessDate;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.BookingWhereInput = {
      ...(hotel ? { roomType: { hotelId: hotel.id } } : {}),
      ...(kind === 'ARRIVALS'
        ? {
            status: 'CONFIRMED' as const,
            checkIn: { lte: selectedDate },
            checkOut: { gt: selectedDate },
          }
        : kind === 'IN_HOUSE'
          ? { status: 'CHECKED_IN' as const, checkIn: { lte: selectedDate } }
          : { status: 'CHECKED_IN' as const, checkOut: { lte: selectedDate } }),
    };

    const search = query.search?.trim();
    if (search) {
      const literalSearch = escapeLikeWildcards(search);
      where.OR = [
        { publicReference: { contains: literalSearch, mode: 'insensitive' } },
        { guestName: { contains: literalSearch, mode: 'insensitive' } },
        {
          assignments: {
            some: {
              isActive: true,
              room: { roomNumber: { contains: literalSearch, mode: 'insensitive' } },
            },
          },
        },
      ];
    }

    const orderBy: Prisma.BookingOrderByWithRelationInput[] =
      kind === 'ARRIVALS'
        ? [{ checkIn: 'asc' }, { publicReference: 'asc' }]
        : [{ checkOut: 'asc' }, { publicReference: 'asc' }];
    const { records, totalItems } = await this.prisma.$transaction(
      async (tx) => {
        const [records, totalItems] = await Promise.all([
          tx.booking.findMany({
            where,
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: worklistSelect,
          }),
          tx.booking.count({ where }),
        ]);
        return { records, totalItems };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      date: dateOnly(selectedDate),
      businessDate: dateOnly(businessDate),
      items: records.map(toWorklistItem),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }
}
