import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { StaffPrincipal } from '../staff-auth/staff-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { parseDateOnly } from '../availability/date-range';
import { RoomCapacityService, hotelBusinessDate } from '../rooms/room-capacity.service';
import {
  AssignMaintenanceRequestDto,
  CreateMaintenanceRequestDto,
  CreateRoomBlockDto,
  MaintenanceRequestDto,
  MaintenanceRequestListDto,
  MaintenanceRequestQueryDto,
  MaintenanceAssigneeListDto,
  MaintenanceRoomListDto,
  ResolveMaintenanceRequestDto,
  RestoreRoomBlockDto,
  RoomBlockDto,
  RoomBlockListDto,
  RoomBlockQueryDto,
} from './dto/maintenance.dto';

const maintenanceRequestSelect = {
  id: true,
  category: true,
  description: true,
  priority: true,
  status: true,
  expectedDate: true,
  openedAt: true,
  assignedAt: true,
  resolvedAt: true,
  resolutionNote: true,
  room: {
    select: {
      id: true,
      roomNumber: true,
      floor: true,
      roomType: { select: { name: true } },
    },
  },
  assignedTo: { select: { id: true, username: true } },
  createdBy: { select: { id: true, username: true } },
  resolvedBy: { select: { id: true, username: true } },
} satisfies Prisma.MaintenanceRequestSelect;

const roomBlockSelect = {
  id: true,
  roomId: true,
  startDate: true,
  endDate: true,
  kind: true,
  reason: true,
  isActive: true,
  createdAt: true,
  room: {
    select: {
      id: true,
      roomNumber: true,
      floor: true,
      roomType: { select: { id: true, name: true } },
    },
  },
  createdBy: { select: { id: true, username: true } },
} satisfies Prisma.RoomBlockSelect;

type MaintenanceRequestRecord = Prisma.MaintenanceRequestGetPayload<{
  select: typeof maintenanceRequestSelect;
}>;
type RoomBlockRecord = Prisma.RoomBlockGetPayload<{ select: typeof roomBlockSelect }>;

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function maintenanceConflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

function toMaintenanceRequestDto(record: MaintenanceRequestRecord): MaintenanceRequestDto {
  return {
    id: record.id,
    room: {
      id: record.room.id,
      roomNumber: record.room.roomNumber,
      floor: record.room.floor,
      roomTypeName: record.room.roomType.name,
    },
    category: record.category,
    description: record.description,
    priority: record.priority,
    status: record.status,
    expectedDate: dateString(record.expectedDate),
    openedAt: record.openedAt.toISOString(),
    assignedAt: record.assignedAt?.toISOString() ?? null,
    assignee: record.assignedTo,
    createdBy: record.createdBy,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    resolvedBy: record.resolvedBy,
    resolutionNote: record.resolutionNote,
  };
}

function toRoomBlockDto(record: RoomBlockRecord, businessDate: string): RoomBlockDto {
  return {
    id: record.id,
    room: {
      id: record.room.id,
      roomNumber: record.room.roomNumber,
      floor: record.room.floor,
      roomTypeName: record.room.roomType.name,
    },
    startDate: dateString(record.startDate),
    expectedReturnDate: dateString(record.endDate),
    kind: record.kind,
    reason: record.reason,
    status: record.isActive
      ? dateString(record.endDate) <= businessDate
        ? 'EXPIRED'
        : 'ACTIVE'
      : 'RESTORED',
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
  };
}

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: RoomCapacityService,
    private readonly audit: AuditService,
  ) {}

  async listAssignees(): Promise<MaintenanceAssigneeListDto> {
    const items = await this.prisma.staffUser.findMany({
      where: { isActive: true, role: { not: 'CASHIER' } },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
      select: { id: true, username: true },
    });
    return { items };
  }

  async listRooms(): Promise<MaintenanceRoomListDto> {
    const items = await this.prisma.room.findMany({
      where: { isActive: true },
      orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        roomNumber: true,
        floor: true,
        roomType: { select: { name: true } },
      },
    });
    return {
      items: items.map((room) => ({
        id: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        roomTypeName: room.roomType.name,
      })),
    };
  }

  async listRequests(query: MaintenanceRequestQueryDto): Promise<MaintenanceRequestListDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.MaintenanceRequestWhereInput = {
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.floor ? { room: { floor: query.floor } } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigneeStaffUserId ? { assignedToStaffUserId: query.assigneeStaffUserId } : {}),
      ...(query.expectedDate ? { expectedDate: parseDateOnly(query.expectedDate) } : {}),
    };
    const [totalItems, records] = await Promise.all([
      this.prisma.maintenanceRequest.count({ where }),
      this.prisma.maintenanceRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { expectedDate: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: maintenanceRequestSelect,
      }),
    ]);
    return {
      items: records.map(toMaintenanceRequestDto),
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    };
  }

  async createRequest(
    actor: StaffPrincipal,
    dto: CreateMaintenanceRequestDto,
  ): Promise<MaintenanceRequestDto> {
    const expectedDate = parseDateOnly(dto.expectedDate);
    const record = await this.prisma.$transaction(async (transaction) => {
      const room = await transaction.room.findUnique({
        where: { id: dto.roomId },
        select: { id: true, isActive: true },
      });
      if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      if (!room.isActive) {
        throw maintenanceConflict('ROOM_INACTIVE', 'Maintenance requests require an active room.');
      }

      const created = await transaction.maintenanceRequest.create({
        data: {
          roomId: room.id,
          category: dto.category,
          description: dto.description,
          priority: dto.priority ?? 'NORMAL',
          expectedDate,
          createdByStaffUserId: actor.id,
        },
        select: maintenanceRequestSelect,
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'MAINTENANCE_REQUEST_CREATED',
        targetType: 'MAINTENANCE_REQUEST',
        targetId: created.id,
        after: {
          roomId: room.id,
          maintenanceCategory: dto.category,
          priority: created.priority,
          expectedDate: dto.expectedDate,
          status: created.status,
        },
      });
      return created;
    });
    return toMaintenanceRequestDto(record);
  }

  async assignRequest(
    actor: StaffPrincipal,
    requestId: string,
    dto: AssignMaintenanceRequestDto,
  ): Promise<MaintenanceRequestDto> {
    const record = await this.prisma.$transaction(async (transaction) => {
      await this.lockRequest(transaction, requestId);
      const current = await transaction.maintenanceRequest.findUnique({
        where: { id: requestId },
        select: maintenanceRequestSelect,
      });
      if (!current) throw new NotFoundException({ code: 'MAINTENANCE_REQUEST_NOT_FOUND' });
      if (current.status !== 'OPEN') {
        throw maintenanceConflict(
          'MAINTENANCE_REQUEST_NOT_OPEN',
          'Resolved work cannot be reassigned.',
        );
      }
      if (current.assignedTo?.id === dto.assigneeStaffUserId) return current;

      const assignee = await transaction.staffUser.findUnique({
        where: { id: dto.assigneeStaffUserId },
        select: { id: true, isActive: true, role: true },
      });
      if (!assignee || !assignee.isActive || assignee.role === 'CASHIER') {
        throw new NotFoundException({ code: 'MAINTENANCE_ASSIGNEE_NOT_FOUND' });
      }

      const updated = await transaction.maintenanceRequest.update({
        where: { id: requestId },
        data: {
          assignedToStaffUserId: assignee.id,
          assignedAt: new Date(),
          assignedByStaffUserId: actor.id,
        },
        select: maintenanceRequestSelect,
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'MAINTENANCE_REQUEST_ASSIGNED',
        targetType: 'MAINTENANCE_REQUEST',
        targetId: requestId,
        before: { assignedToStaffUserId: current.assignedTo?.id ?? null },
        after: { assignedToStaffUserId: assignee.id, status: current.status },
      });
      return updated;
    });
    return toMaintenanceRequestDto(record);
  }

  async resolveRequest(
    actor: StaffPrincipal,
    requestId: string,
    dto: ResolveMaintenanceRequestDto,
  ): Promise<MaintenanceRequestDto> {
    const record = await this.prisma.$transaction(async (transaction) => {
      await this.lockRequest(transaction, requestId);
      const current = await transaction.maintenanceRequest.findUnique({
        where: { id: requestId },
        select: maintenanceRequestSelect,
      });
      if (!current) throw new NotFoundException({ code: 'MAINTENANCE_REQUEST_NOT_FOUND' });
      if (current.status === 'RESOLVED') return current;

      const updated = await transaction.maintenanceRequest.update({
        where: { id: requestId },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedByStaffUserId: actor.id,
          resolutionNote: dto.resolutionNote,
        },
        select: maintenanceRequestSelect,
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'MAINTENANCE_REQUEST_RESOLVED',
        targetType: 'MAINTENANCE_REQUEST',
        targetId: requestId,
        before: { status: current.status },
        after: { status: updated.status, roomId: current.room.id },
      });
      return updated;
    });
    return toMaintenanceRequestDto(record);
  }

  async listBlocks(query: RoomBlockQueryDto): Promise<RoomBlockListDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const hotel = await this.prisma.hotel.findFirst({ select: { timezone: true } });
    const businessDate = dateString(hotelBusinessDate(hotel?.timezone ?? 'Asia/Tehran'));
    const where: Prisma.RoomBlockWhereInput = {
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.floor ? { room: { floor: query.floor } } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.expectedReturnDate ? { endDate: parseDateOnly(query.expectedReturnDate) } : {}),
      ...(query.reason ? { reason: { contains: query.reason, mode: 'insensitive' } } : {}),
      ...(query.activeOn
        ? {
            isActive: true,
            startDate: { lte: parseDateOnly(query.activeOn) },
            endDate: { gt: parseDateOnly(query.activeOn) },
          }
        : {}),
      ...(query.status === 'RESTORED'
        ? { isActive: false }
        : query.status === 'EXPIRED'
          ? { isActive: true, endDate: { lte: parseDateOnly(businessDate) } }
          : query.status === 'ACTIVE'
            ? { isActive: true, endDate: { gt: parseDateOnly(businessDate) } }
            : {}),
    };
    const [totalItems, records] = await Promise.all([
      this.prisma.roomBlock.count({ where }),
      this.prisma.roomBlock.findMany({
        where,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: roomBlockSelect,
      }),
    ]);
    return {
      items: records.map((record) => toRoomBlockDto(record, businessDate)),
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    };
  }

  async createBlock(actor: StaffPrincipal, dto: CreateRoomBlockDto): Promise<RoomBlockDto> {
    const startDate = parseDateOnly(dto.startDate);
    const endDate = parseDateOnly(dto.endDate);
    if (startDate >= endDate) {
      throw new BadRequestException({
        code: 'INVALID_BLOCK_DATE_RANGE',
        message: 'Block end date must be after its start date.',
      });
    }

    const record = await this.prisma.$transaction(async (transaction) => {
      const initialRoom = await transaction.room.findUnique({
        where: { id: dto.roomId },
        select: { id: true, roomTypeId: true },
      });
      if (!initialRoom) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      if (!(await this.capacity.lockRoomType(transaction, initialRoom.roomTypeId))) {
        throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      }
      await this.capacity.lockRoom(transaction, initialRoom.id);
      const room = await transaction.room.findUnique({
        where: { id: initialRoom.id },
        select: { id: true, roomTypeId: true, isActive: true },
      });
      if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      if (!room.isActive) {
        throw maintenanceConflict('ROOM_INACTIVE', 'Inactive rooms cannot be blocked.');
      }

      const overlappingBlock = await transaction.roomBlock.findFirst({
        where: {
          roomId: room.id,
          isActive: true,
          startDate: { lt: endDate },
          endDate: { gt: startDate },
        },
        select: { id: true },
      });
      if (overlappingBlock) {
        throw maintenanceConflict(
          'ROOM_BLOCK_OVERLAP',
          'This room already has an overlapping block.',
        );
      }
      const overlappingAssignment = await transaction.roomAssignment.findFirst({
        where: {
          roomId: room.id,
          isActive: true,
          startDate: { lt: endDate },
          endDate: { gt: startDate },
        },
        select: { id: true },
      });
      if (overlappingAssignment) {
        throw maintenanceConflict(
          'ROOM_HAS_ACTIVE_ASSIGNMENT',
          'Reassign the room before creating a block for these dates.',
        );
      }

      const businessDate = await this.capacity.getHotelBusinessDate(transaction, room.roomTypeId);
      if (!businessDate) throw new NotFoundException({ code: 'ROOM_TYPE_NOT_FOUND' });
      const created = await transaction.roomBlock.create({
        data: {
          roomId: room.id,
          startDate,
          endDate,
          kind: dto.kind,
          reason: dto.reason,
          createdByStaffUserId: actor.id,
        },
        select: roomBlockSelect,
      });
      const projectionStart = startDate < businessDate ? businessDate : startDate;
      if (projectionStart < endDate) {
        const inventory = await this.capacity.lockAndProjectInventory(
          transaction,
          room.roomTypeId,
          projectionStart,
          endDate,
        );
        await this.capacity.persistProjection(transaction, inventory);
      }
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'ROOM_BLOCK_CREATED',
        targetType: 'ROOM_BLOCK',
        targetId: created.id,
        after: {
          roomId: room.id,
          blockKind: created.kind,
          startDate: dto.startDate,
          endDate: dto.endDate,
          status: 'ACTIVE',
        },
      });
      return { created, businessDate: dateString(businessDate) };
    });
    return toRoomBlockDto(record.created, record.businessDate);
  }

  async restoreBlock(
    actor: StaffPrincipal,
    blockId: string,
    dto: RestoreRoomBlockDto,
  ): Promise<RoomBlockDto> {
    const initial = await this.prisma.roomBlock.findUnique({
      where: { id: blockId },
      select: { id: true, roomId: true, room: { select: { roomTypeId: true } } },
    });
    if (!initial) throw new NotFoundException({ code: 'ROOM_BLOCK_NOT_FOUND' });

    const result = await this.prisma.$transaction(async (transaction) => {
      await this.capacity.lockRoomType(transaction, initial.room.roomTypeId);
      await this.capacity.lockRoom(transaction, initial.roomId);
      await this.lockBlock(transaction, blockId);
      const current = await transaction.roomBlock.findUnique({
        where: { id: blockId },
        select: roomBlockSelect,
      });
      if (!current) throw new NotFoundException({ code: 'ROOM_BLOCK_NOT_FOUND' });
      const businessDate = await this.capacity.getHotelBusinessDate(
        transaction,
        initial.room.roomTypeId,
      );
      if (!businessDate) throw new NotFoundException({ code: 'ROOM_TYPE_NOT_FOUND' });
      if (!current.isActive) return { record: current, businessDate: dateString(businessDate) };

      const updated = await transaction.roomBlock.update({
        where: { id: blockId },
        data: { isActive: false },
        select: roomBlockSelect,
      });
      const projectionStart = current.startDate < businessDate ? businessDate : current.startDate;
      if (projectionStart < current.endDate) {
        const inventory = await this.capacity.lockAndProjectInventory(
          transaction,
          initial.room.roomTypeId,
          projectionStart,
          current.endDate,
        );
        await this.capacity.persistProjection(transaction, inventory);
      }
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'ROOM_BLOCK_RESTORED',
        targetType: 'ROOM_BLOCK',
        targetId: blockId,
        reason: dto.reason,
        before: { roomId: current.roomId, blockKind: current.kind, status: 'ACTIVE' },
        after: { roomId: current.roomId, blockKind: current.kind, status: 'RESTORED' },
      });
      return { record: updated, businessDate: dateString(businessDate) };
    });
    return toRoomBlockDto(result.record, result.businessDate);
  }

  private async lockRequest(
    transaction: Prisma.TransactionClient,
    requestId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "maintenance_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException({ code: 'MAINTENANCE_REQUEST_NOT_FOUND' });
  }

  private async lockBlock(transaction: Prisma.TransactionClient, blockId: string): Promise<void> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "room_blocks" WHERE "id" = ${blockId}::uuid FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException({ code: 'ROOM_BLOCK_NOT_FOUND' });
  }
}
