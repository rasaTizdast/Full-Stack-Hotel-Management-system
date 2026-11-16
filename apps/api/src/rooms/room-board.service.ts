import { Injectable, NotFoundException } from '@nestjs/common';
import { HOTEL_TIME_ZONE, parseDateOnly } from '../availability/date-range';
import { PrismaService } from '../database/prisma.service';
import { assignmentRevision } from './assignment-revision';
import type { RoomBoardDto, RoomBoardItemDto, RoomBoardQueryDto } from './dto/room-board.dto';
import { reservationContextOn } from './room-board-context';
import { hotelBusinessDate } from './room-capacity.service';
import { roomSelect } from './rooms.service';

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

function matchesContextFilters(item: RoomBoardItemDto, query: RoomBoardQueryDto): boolean {
  if (query.occupancy && item.occupancy !== query.occupancy) return false;
  const matchesStay =
    !query.stayContext ||
    (query.stayContext === 'NONE'
      ? item.reservationContexts.length === 0
      : item.reservationContexts.some((context) => context.stayContext === query.stayContext));
  const matchesBlock =
    !query.blockKind ||
    (query.blockKind === 'NONE'
      ? item.blocks.length === 0
      : item.blocks.some((block) => block.kind === query.blockKind));
  return matchesStay && matchesBlock;
}

@Injectable()
export class RoomBoardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: RoomBoardQueryDto): Promise<RoomBoardDto> {
    const requestedDate = query.date ? parseDateOnly(query.date) : undefined;
    const now = new Date();
    return this.prisma.$transaction(
      async (transaction) => {
        const roomType = query.roomTypeId
          ? await transaction.roomType.findUnique({
              where: { id: query.roomTypeId },
              select: { hotel: { select: { id: true, timezone: true } } },
            })
          : undefined;
        if (query.roomTypeId && !roomType)
          throw new NotFoundException({ code: 'ROOM_TYPE_NOT_FOUND' });
        const hotel =
          roomType?.hotel ??
          (await transaction.hotel.findFirst({
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, timezone: true },
          }));

        const businessDate = hotelBusinessDate(hotel?.timezone ?? HOTEL_TIME_ZONE, now);
        const date = requestedDate ?? businessDate;
        const header = {
          date: dateOnly(date),
          businessDate: dateOnly(businessDate),
          updatedAt: now.toISOString(),
        };
        if (!hotel) return { ...header, items: [], assignableBookings: [] };

        const rooms = await transaction.room.findMany({
          where: {
            hotelId: hotel.id,
            roomTypeId: query.roomTypeId,
            floor: query.floor,
            housekeepingStatus: query.housekeepingStatus,
          },
          orderBy: [{ roomType: { displayOrder: 'asc' } }, { roomNumber: 'asc' }, { id: 'asc' }],
          select: {
            ...roomSelect,
            assignments: {
              where: {
                isActive: true,
                startDate: { lte: date },
                endDate: { gte: date },
                booking: { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
              },
              orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                startDate: true,
                endDate: true,
                booking: {
                  select: {
                    publicReference: true,
                    guestName: true,
                    checkIn: true,
                    checkOut: true,
                    status: true,
                  },
                },
              },
            },
          },
        });
        // Await blocks separately to avoid overlapping queries on the transaction client.
        const blocks = await transaction.roomBlock.findMany({
          where: {
            roomId: { in: rooms.map(({ id }) => id) },
            isActive: true,
            startDate: { lte: date },
            endDate: { gt: date },
          },
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
          select: { roomId: true, id: true, kind: true, startDate: true, endDate: true },
        });
        const blocksByRoom = new Map<string, RoomBoardItemDto['blocks']>();
        for (const { roomId, id, kind, startDate, endDate } of blocks) {
          const block = { id, kind, startDate: dateOnly(startDate), endDate: dateOnly(endDate) };
          const roomBlocks = blocksByRoom.get(roomId);
          if (roomBlocks) roomBlocks.push(block);
          else blocksByRoom.set(roomId, [block]);
        }
        const bookings = await transaction.booking.findMany({
          where: {
            status: 'CONFIRMED',
            checkIn: { lte: date },
            checkOut: { gt: date },
            roomTypeId: query.roomTypeId,
            roomType: { hotelId: hotel.id },
          },
          orderBy: [{ checkIn: 'asc' }, { publicReference: 'asc' }],
          select: {
            id: true,
            publicReference: true,
            guestName: true,
            roomType: { select: { id: true, name: true } },
            checkIn: true,
            checkOut: true,
            roomQuantity: true,
            assignments: {
              orderBy: [{ roomId: 'asc' }, { startDate: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                startDate: true,
                endDate: true,
                roomId: true,
                isActive: true,
                room: { select: { roomNumber: true } },
              },
            },
          },
        });

        const items = rooms
          .map<RoomBoardItemDto>(({ assignments, ...room }) => {
            const reservationContexts = assignments.flatMap((assignment) => {
              const stayContext = reservationContextOn(date, assignment);
              return stayContext
                ? [
                    {
                      assignmentId: assignment.id,
                      reference: assignment.booking.publicReference,
                      guestName: assignment.booking.guestName,
                      startDate: dateOnly(assignment.startDate),
                      endDate: dateOnly(assignment.endDate),
                      stayContext,
                    },
                  ]
                : [];
            });
            const isOccupied = reservationContexts.some(
              ({ stayContext }) => stayContext === 'IN_HOUSE',
            );
            return {
              ...room,
              occupancy: isOccupied
                ? 'OCCUPIED'
                : reservationContexts.length
                  ? 'UNKNOWN'
                  : 'VACANT',
              reservationContexts,
              blocks: blocksByRoom.get(room.id) ?? [],
            };
          })
          .filter((item) => matchesContextFilters(item, query));

        return {
          ...header,
          items,
          assignableBookings: bookings.map((booking) => {
            const activeAssignments = booking.assignments.filter(
              (assignment) => assignment.isActive,
            );
            const assignedToday = new Set(
              activeAssignments.flatMap(({ startDate, endDate, roomId }) =>
                startDate <= date && date < endDate ? [roomId] : [],
              ),
            );
            return {
              reference: booking.publicReference,
              guestName: booking.guestName,
              roomTypeId: booking.roomType.id,
              roomTypeName: booking.roomType.name,
              checkIn: dateOnly(booking.checkIn),
              checkOut: dateOnly(booking.checkOut),
              roomQuantity: booking.roomQuantity,
              revision: assignmentRevision(booking.id, booking.assignments),
              unassignedRoomQuantity: Math.max(0, booking.roomQuantity - assignedToday.size),
              assignments: activeAssignments.map(({ id, roomId, room, startDate, endDate }) => ({
                id,
                roomId,
                roomNumber: room.roomNumber,
                startDate: dateOnly(startDate),
                endDate: dateOnly(endDate),
              })),
            };
          }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
