import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuditSnapshot } from '../audit/audit.types';
import { CreateRoomDto } from './dto/create-room.dto';
import { StaffRoomsQueryDto } from './dto/staff-rooms-query.dto';
import { StaffRoomDto, StaffRoomListDto } from './dto/staff-room-response.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomCapacityService } from './room-capacity.service';

export const roomSelect = {
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

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: RoomCapacityService,
    private readonly audit: AuditService,
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

  async create(actorStaffUserId: string, dto: CreateRoomDto): Promise<StaffRoomDto> {
    return this.prisma.$transaction(async (transaction) => {
      if (!(await this.capacity.lockRoomType(transaction, dto.roomTypeId))) {
        throw new NotFoundException({ code: 'ROOM_TYPE_NOT_FOUND' });
      }
      const roomType = await transaction.roomType.findUnique({
        where: { id: dto.roomTypeId },
        select: {
          id: true,
          hotelId: true,
          isActive: true,
          hotel: { select: { businessDate: true } },
        },
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

      const inventory = await this.capacity.lockAndProjectInventory(
        transaction,
        roomType.id,
        roomType.hotel.businessDate,
      );
      await this.capacity.persistProjection(transaction, inventory);
      await this.audit.record(transaction, {
        actorStaffUserId,
        eventName: 'ROOM_CREATED',
        targetType: 'ROOM',
        targetId: room.id,
        after: { roomNumber: room.roomNumber, isActive: room.isActive },
      });
      return toRoomDto(room);
    });
  }

  async update(
    actorStaffUserId: string,
    roomId: string,
    dto: UpdateRoomDto,
  ): Promise<StaffRoomDto> {
    return this.prisma.$transaction(async (transaction) => {
      await this.capacity.lockRoom(transaction, roomId);
      const current = await transaction.room.findUnique({
        where: { id: roomId },
        select: roomSelect,
      });
      if (!current) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      const roomNumberChanged =
        dto.roomNumber !== undefined && dto.roomNumber !== current.roomNumber;
      if (!roomNumberChanged && dto.floor === undefined && dto.features === undefined) {
        return toRoomDto(current);
      }

      try {
        const updated = await transaction.room.update({
          where: { id: roomId },
          data: {
            ...(roomNumberChanged && dto.roomNumber !== undefined
              ? { roomNumber: dto.roomNumber, isGenerated: false }
              : {}),
            ...(dto.floor !== undefined ? { floor: dto.floor?.trim() || null } : {}),
            ...(dto.features !== undefined
              ? { features: dto.features.map((feature) => feature.trim()) }
              : {}),
          },
          select: roomSelect,
        });
        const before: AuditSnapshot = {};
        const after: AuditSnapshot = {};
        if (roomNumberChanged) {
          before.roomNumber = current.roomNumber;
          after.roomNumber = updated.roomNumber;
          before.isGenerated = current.isGenerated;
          after.isGenerated = updated.isGenerated;
        }
        if (dto.floor !== undefined) {
          before.floor = current.floor;
          after.floor = updated.floor;
        }
        await this.audit.record(transaction, {
          actorStaffUserId,
          eventName: 'ROOM_UPDATED',
          targetType: 'ROOM',
          targetId: updated.id,
          ...(Object.keys(before).length > 0 ? { before, after } : {}),
        });
        return toRoomDto(updated);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw domainConflict('ROOM_NUMBER_TAKEN');
        }
        throw error;
      }
    });
  }

  async deactivate(actorStaffUserId: string, roomId: string): Promise<StaffRoomDto> {
    return this.prisma.$transaction(async (transaction) => {
      const initialRoom = await transaction.room.findUnique({
        where: { id: roomId },
        select: { id: true, roomTypeId: true },
      });
      if (!initialRoom) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      await this.capacity.lockRoomType(transaction, initialRoom.roomTypeId);

      await this.capacity.lockRoom(transaction, roomId);
      const room = await transaction.room.findUnique({
        where: { id: roomId },
        select: { roomTypeId: true, isActive: true, hotel: { select: { businessDate: true } } },
      });
      if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      if (!room.isActive) {
        const existing = await transaction.room.findUniqueOrThrow({
          where: { id: roomId },
          select: roomSelect,
        });
        return toRoomDto(existing);
      }

      const today = room.hotel.businessDate;
      const assignments = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "room_assignments"
        WHERE "room_id" = ${roomId}::uuid
          AND "is_active" = true
          AND "end_date" >= ${today}::date
        LIMIT 1
      `;
      if (assignments.length > 0) throw domainConflict('ROOM_HAS_ACTIVE_ASSIGNMENTS');

      await transaction.room.update({ where: { id: roomId }, data: { isActive: false } });
      const inventory = await this.capacity.lockAndProjectInventory(
        transaction,
        room.roomTypeId,
        today,
      );
      await this.capacity.persistProjection(transaction, inventory);
      const updated = await transaction.room.findUniqueOrThrow({
        where: { id: roomId },
        select: roomSelect,
      });
      await this.audit.record(transaction, {
        actorStaffUserId,
        eventName: 'ROOM_DEACTIVATED',
        targetType: 'ROOM',
        targetId: roomId,
        before: { isActive: true },
        after: { isActive: false },
      });
      return toRoomDto(updated);
    });
  }

  async reactivate(actorStaffUserId: string, roomId: string): Promise<StaffRoomDto> {
    return this.prisma.$transaction(async (transaction) => {
      const initialRoom = await transaction.room.findUnique({
        where: { id: roomId },
        select: { id: true, roomTypeId: true },
      });
      if (!initialRoom) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      await this.capacity.lockRoomType(transaction, initialRoom.roomTypeId);

      await this.capacity.lockRoom(transaction, roomId);
      const room = await transaction.room.findUnique({
        where: { id: roomId },
        select: { roomTypeId: true, isActive: true, hotel: { select: { businessDate: true } } },
      });
      if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      const today = room.hotel.businessDate;
      if (!room.isActive) {
        await transaction.room.update({ where: { id: roomId }, data: { isActive: true } });
      }

      const inventory = await this.capacity.lockAndProjectInventory(
        transaction,
        room.roomTypeId,
        today,
      );
      await this.capacity.persistProjection(transaction, inventory);
      const updated = await transaction.room.findUniqueOrThrow({
        where: { id: roomId },
        select: roomSelect,
      });
      if (!room.isActive) {
        await this.audit.record(transaction, {
          actorStaffUserId,
          eventName: 'ROOM_REACTIVATED',
          targetType: 'ROOM',
          targetId: roomId,
          before: { isActive: false },
          after: { isActive: true },
        });
      }
      return toRoomDto(updated);
    });
  }
}
