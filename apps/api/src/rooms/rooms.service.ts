import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { StaffRoomsQueryDto } from './dto/staff-rooms-query.dto';
import { StaffRoomDto, StaffRoomListDto } from './dto/staff-room-response.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomCapacityService } from './room-capacity.service';

const roomSelect = {
  id: true,
  roomNumber: true,
  floor: true,
  features: true,
  housekeepingStatus: true,
  isActive: true,
  isGenerated: true,
  roomType: { select: { id: true, name: true, slug: true } },
} as const;

type RoomRecord = Prisma.RoomGetPayload<{ select: typeof roomSelect }>;

function toRoomDto(room: RoomRecord): StaffRoomDto {
  return {
    id: room.id,
    roomNumber: room.roomNumber,
    floor: room.floor,
    features: room.features,
    housekeepingStatus: room.housekeepingStatus,
    isActive: room.isActive,
    isGenerated: room.isGenerated,
    roomType: room.roomType,
  };
}

function domainConflict(code: string): ConflictException {
  return new ConflictException({
    code,
    message: 'The room change conflicts with current hotel operations.',
  });
}

function propertyDate(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(values.get('year'));
  const month = Number(values.get('month'));
  const day = Number(values.get('day'));
  return new Date(Date.UTC(year, month - 1, day));
}

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: RoomCapacityService,
  ) {}

  async list(query: StaffRoomsQueryDto): Promise<StaffRoomListDto> {
    const search = query.search?.trim();
    const rooms = await this.prisma.room.findMany({
      where: {
        ...(query.roomTypeId ? { roomTypeId: query.roomTypeId } : {}),
        ...(query.floor ? { floor: query.floor } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(search
          ? {
              OR: [
                { roomNumber: { contains: search, mode: 'insensitive' } },
                { roomType: { name: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ roomType: { displayOrder: 'asc' } }, { roomNumber: 'asc' }, { id: 'asc' }],
      select: roomSelect,
    });

    return { items: rooms.map(toRoomDto) };
  }

  async create(dto: CreateRoomDto): Promise<StaffRoomDto> {
    return this.prisma.$transaction(async (transaction) => {
      if (!(await this.capacity.lockRoomType(transaction, dto.roomTypeId))) {
        throw new NotFoundException({ code: 'ROOM_TYPE_NOT_FOUND' });
      }
      const roomType = await transaction.roomType.findUnique({
        where: { id: dto.roomTypeId },
        select: { id: true, hotelId: true, isActive: true },
      });
      if (!roomType) throw new NotFoundException({ code: 'ROOM_TYPE_NOT_FOUND' });
      if (!roomType.isActive) throw domainConflict('ROOM_TYPE_INACTIVE');

      let room: RoomRecord;
      try {
        room = await transaction.room.create({
          data: {
            hotelId: roomType.hotelId,
            roomTypeId: roomType.id,
            roomNumber: dto.roomNumber,
            floor: dto.floor?.trim() || null,
            features: (dto.features ?? []).map((feature) => feature.trim()),
          },
          select: roomSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw domainConflict('ROOM_NUMBER_TAKEN');
        }
        throw error;
      }

      const inventory = await this.capacity.lockAndProjectInventory(transaction, roomType.id);
      await this.capacity.persistProjection(transaction, inventory);
      return toRoomDto(room);
    });
  }

  async update(roomId: string, dto: UpdateRoomDto): Promise<StaffRoomDto> {
    const current = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: roomSelect,
    });
    if (!current) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
    if (dto.roomNumber === undefined && dto.floor === undefined && dto.features === undefined) {
      return toRoomDto(current);
    }

    try {
      const updated = await this.prisma.room.update({
        where: { id: roomId },
        data: {
          ...(dto.roomNumber !== undefined
            ? { roomNumber: dto.roomNumber, isGenerated: false }
            : {}),
          ...(dto.floor !== undefined ? { floor: dto.floor?.trim() || null } : {}),
          ...(dto.features !== undefined
            ? { features: dto.features.map((feature) => feature.trim()) }
            : {}),
        },
        select: roomSelect,
      });
      return toRoomDto(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw domainConflict('ROOM_NUMBER_TAKEN');
      }
      throw error;
    }
  }

  async deactivate(roomId: string): Promise<StaffRoomDto> {
    return this.prisma.$transaction(async (transaction) => {
      const initialRoom = await transaction.room.findUnique({
        where: { id: roomId },
        select: { id: true, roomTypeId: true },
      });
      if (!initialRoom) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      await this.capacity.lockRoomType(transaction, initialRoom.roomTypeId);

      const lockedRoom = await transaction.$queryRaw<
        Array<{ id: string; roomTypeId: string; isActive: boolean; timeZone: string }>
      >`
        SELECT room."id", room."room_type_id" AS "roomTypeId", room."is_active" AS "isActive",
               hotel."timezone" AS "timeZone"
        FROM "rooms" AS room
        JOIN "hotels" AS hotel ON hotel."id" = room."hotel_id"
        WHERE room."id" = ${roomId}::uuid
        FOR UPDATE OF room
      `;
      const room = lockedRoom[0];
      if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      if (!room.isActive) {
        const existing = await transaction.room.findUniqueOrThrow({
          where: { id: roomId },
          select: roomSelect,
        });
        return toRoomDto(existing);
      }

      const today = propertyDate(room.timeZone);
      const assignments = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "room_assignments"
        WHERE "room_id" = ${roomId}::uuid
          AND "is_active" = true
          AND "end_date" > ${today}::date
        LIMIT 1
      `;
      if (assignments.length > 0) throw domainConflict('ROOM_HAS_ACTIVE_ASSIGNMENTS');

      await transaction.room.update({ where: { id: roomId }, data: { isActive: false } });
      const inventory = await this.capacity.lockAndProjectInventory(transaction, room.roomTypeId);
      await this.capacity.persistProjection(transaction, inventory);
      const updated = await transaction.room.findUniqueOrThrow({
        where: { id: roomId },
        select: roomSelect,
      });
      return toRoomDto(updated);
    });
  }

  async reactivate(roomId: string): Promise<StaffRoomDto> {
    return this.prisma.$transaction(async (transaction) => {
      const initialRoom = await transaction.room.findUnique({
        where: { id: roomId },
        select: { id: true, roomTypeId: true },
      });
      if (!initialRoom) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      await this.capacity.lockRoomType(transaction, initialRoom.roomTypeId);

      const lockedRoom = await transaction.$queryRaw<
        Array<{ id: string; roomTypeId: string; isActive: boolean }>
      >`
        SELECT "id", "room_type_id" AS "roomTypeId", "is_active" AS "isActive"
        FROM "rooms"
        WHERE "id" = ${roomId}::uuid
        FOR UPDATE
      `;
      const room = lockedRoom[0];
      if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      if (!room.isActive) {
        await transaction.room.update({ where: { id: roomId }, data: { isActive: true } });
      }

      const inventory = await this.capacity.lockAndProjectInventory(transaction, room.roomTypeId);
      await this.capacity.persistProjection(transaction, inventory);
      const updated = await transaction.room.findUniqueOrThrow({
        where: { id: roomId },
        select: roomSelect,
      });
      return toRoomDto(updated);
    });
  }
}
