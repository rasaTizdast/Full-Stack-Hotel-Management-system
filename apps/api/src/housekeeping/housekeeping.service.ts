import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { HousekeepingTaskStatus, RoomDiscrepancyType } from '../generated/prisma/enums';
import { HOTEL_TIME_ZONE, parseDateOnly } from '../availability/date-range';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { StaffRole } from '../generated/prisma/enums';
import type { StaffPrincipal } from '../staff-auth/staff-auth.types';
import {
  assertTaskCanBeCancelled,
  assertTaskCanBeCompleted,
  assertTaskCanBeStarted,
  HousekeepingRuleError,
  resolveTaskCompletion,
} from './housekeeping.rules';
import { orderHousekeepingQueue } from './housekeeping-order';
import type {
  AssignHousekeepingTaskDto,
  CompleteHousekeepingTaskDto,
  CreateHousekeepingTaskDto,
  ReportRoomDiscrepancyDto,
  StaffDiscrepancyQueryDto,
  StaffHousekeepingTaskQueryDto,
  StaffRoomOptionsQueryDto,
} from './dto/housekeeping.dto';
import type {
  HousekeepingTaskDto,
  RoomDiscrepancyDto,
  StaffHousekeepingRoomDto,
} from './dto/housekeeping.dto';
import { hotelBusinessDate, RoomCapacityService } from '../rooms/room-capacity.service';

const activeTaskStatuses: HousekeepingTaskStatus[] = ['OPEN', 'IN_PROGRESS'];
const taskSelect = {
  id: true,
  roomId: true,
  taskType: true,
  businessDate: true,
  priority: true,
  status: true,
  assignedToStaffUserId: true,
  assignedAt: true,
  assignedTo: { select: { id: true, username: true } },
  completionOutcome: true,
  completionReason: true,
  note: true,
  room: {
    select: {
      id: true,
      roomNumber: true,
      floor: true,
      housekeepingStatus: true,
      assignments: {
        where: { isActive: true },
        select: {
          startDate: true,
          endDate: true,
          booking: { select: { status: true, checkIn: true, checkOut: true } },
        },
      },
    },
  },
} satisfies Prisma.HousekeepingTaskSelect;

type TaskRecord = Prisma.HousekeepingTaskGetPayload<{ select: typeof taskSelect }>;

const discrepancySelect = {
  id: true,
  roomId: true,
  businessDate: true,
  kind: true,
  expectedOccupied: true,
  observedOccupied: true,
  status: true,
  note: true,
  reportedAt: true,
  room: { select: { roomNumber: true, floor: true } },
  reportedBy: { select: { id: true, username: true } },
  resolvedBy: { select: { id: true, username: true } },
  resolvedAt: true,
  resolutionReason: true,
} satisfies Prisma.RoomDiscrepancySelect;

type DiscrepancyRecord = Prisma.RoomDiscrepancyGetPayload<{ select: typeof discrepancySelect }>;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function domainConflict(
  code: string,
  message = 'The housekeeping request conflicts with current room state.',
) {
  return new ConflictException({ code, message });
}

function ruleException(error: unknown): never {
  if (!(error instanceof HousekeepingRuleError)) throw error;
  const conflicts = new Set([
    'TASK_STATUS_CONFLICT',
    'ROOM_NOT_CLEAN',
    'ROOM_NOT_INSPECTED',
    'TASK_ALREADY_CANCELLED',
  ]);
  if (conflicts.has(error.code)) throw domainConflict(error.code);
  if (error.code.endsWith('_REQUIRED') || error.code === 'NEEDS_REWORK_INSPECTION_ONLY') {
    throw new BadRequestException({ code: error.code, message: 'The task action is invalid.' });
  }
  throw new ForbiddenException({ code: error.code, message: 'This task is not assigned to you.' });
}

function isManager(role: StaffRole): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

function toTaskDto(
  record: TaskRecord,
  boardDate: Date,
  actor: StaffPrincipal,
): HousekeepingTaskDto {
  const arrivalDue = record.room.assignments.some(
    ({ startDate, endDate, booking }) =>
      booking.status === 'CONFIRMED' &&
      booking.checkIn <= boardDate &&
      booking.checkOut > boardDate &&
      startDate <= boardDate &&
      endDate > boardDate,
  );
  const departureDue = record.room.assignments.some(
    ({ booking }) => booking.status === 'CHECKED_IN' && booking.checkOut <= boardDate,
  );
  const isOverdue = activeTaskStatuses.includes(record.status) && record.businessDate < boardDate;
  const manager = isManager(actor.role);
  const assignedToActor = record.assignedToStaffUserId === actor.id;

  return {
    id: record.id,
    taskType: record.taskType,
    status: record.status,
    priority: record.priority,
    dueDate: dateOnly(record.businessDate),
    isOverdue,
    arrivalDue,
    departureDue,
    room: {
      id: record.room.id,
      roomNumber: record.room.roomNumber,
      floor: record.room.floor,
      housekeepingStatus: record.room.housekeepingStatus,
      occupancy: record.room.assignments.some(
        ({ startDate, endDate, booking }) =>
          booking.status === 'CHECKED_IN' && startDate <= boardDate && endDate > boardDate,
      )
        ? 'OCCUPIED'
        : 'VACANT',
    },
    assignee: record.assignedTo,
    completionOutcome: record.completionOutcome,
    completionReason: record.completionReason,
    note: record.note,
    allowedActions: {
      canAssign: manager && activeTaskStatuses.includes(record.status),
      canStart:
        record.status === 'OPEN' && (manager || (actor.role === 'HOUSEKEEPER' && assignedToActor)),
      canComplete:
        record.status === 'IN_PROGRESS' &&
        (manager || (actor.role === 'HOUSEKEEPER' && assignedToActor)),
      canCancel: manager && activeTaskStatuses.includes(record.status),
    },
  };
}

function toDiscrepancyDto(record: DiscrepancyRecord): RoomDiscrepancyDto {
  return {
    id: record.id,
    roomId: record.roomId,
    roomNumber: record.room.roomNumber,
    floor: record.room.floor,
    businessDate: dateOnly(record.businessDate),
    kind: record.kind,
    expectedOccupied: record.expectedOccupied,
    observedOccupied: record.observedOccupied,
    status: record.status,
    note: record.note,
    reportedAt: record.reportedAt.toISOString(),
    reportedBy: record.reportedBy,
    resolvedBy: record.resolvedBy,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    resolutionReason: record.resolutionReason,
  };
}

function pagination(page: number, pageSize: number, totalItems: number) {
  return { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
}

@Injectable()
export class HousekeepingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: RoomCapacityService,
    private readonly audit: AuditService,
  ) {}

  async listTasks(actor: StaffPrincipal, query: StaffHousekeepingTaskQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.prisma.$transaction(
      async (transaction) => {
        const hotel = await transaction.hotel.findFirst({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, timezone: true },
        });
        const boardDate = query.businessDate
          ? parseDateOnly(query.businessDate)
          : hotelBusinessDate(hotel?.timezone ?? HOTEL_TIME_ZONE);
        if (!hotel) {
          return {
            businessDate: dateOnly(boardDate),
            items: [],
            pagination: pagination(page, pageSize, 0),
          };
        }
        const dueDate = query.dueDate ? parseDateOnly(query.dueDate) : undefined;
        const where: Prisma.HousekeepingTaskWhereInput = {
          room: {
            is: {
              hotelId: hotel.id,
              ...(query.roomId ? { id: query.roomId } : {}),
              ...(query.floor ? { floor: query.floor } : {}),
            },
          },
          ...(actor.role === 'HOUSEKEEPER'
            ? { assignedToStaffUserId: actor.id }
            : query.assigneeStaffUserId
              ? { assignedToStaffUserId: query.assigneeStaffUserId }
              : {}),
          ...(query.taskType ? { taskType: query.taskType } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.priority ? { priority: query.priority } : {}),
          ...(dueDate
            ? { businessDate: dueDate }
            : {
                OR: [
                  { status: { in: activeTaskStatuses }, businessDate: { lte: boardDate } },
                  { businessDate: boardDate },
                ],
              }),
        };
        const all = await transaction.housekeepingTask.findMany({
          where,
          select: taskSelect,
        });
        const orderedIds = orderHousekeepingQueue(
          all.map((record) => {
            const dto = toTaskDto(record, boardDate, actor);
            return {
              id: record.id,
              arrivalDue: dto.arrivalDue,
              departureDue: dto.departureDue,
              isOverdue: dto.isOverdue,
              taskType: record.taskType,
              priority: record.priority,
              dueDate: dto.dueDate,
            };
          }),
        ).map(({ id }) => id);
        const recordsById = new Map(all.map((record) => [record.id, record]));
        const totalItems = orderedIds.length;
        const items = orderedIds
          .slice((page - 1) * pageSize, page * pageSize)
          .map((id) => toTaskDto(recordsById.get(id)!, boardDate, actor));

        return {
          businessDate: dateOnly(boardDate),
          items,
          pagination: pagination(page, pageSize, totalItems),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async createTask(
    actor: StaffPrincipal,
    dto: CreateHousekeepingTaskDto,
  ): Promise<HousekeepingTaskDto> {
    const businessDate = parseDateOnly(dto.businessDate);
    const record = await this.prisma.$transaction(async (transaction) => {
      const initialRoom = await transaction.room.findUnique({
        where: { id: dto.roomId },
        select: { id: true, roomTypeId: true },
      });
      if (!initialRoom) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      await this.capacity.lockRoomType(transaction, initialRoom.roomTypeId);
      await this.capacity.lockRoom(transaction, dto.roomId);
      const room = await transaction.room.findUnique({
        where: { id: dto.roomId },
        select: { id: true, isActive: true },
      });
      if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
      if (!room.isActive) throw domainConflict('ROOM_INACTIVE');

      const task = await transaction.housekeepingTask.create({
        data: {
          roomId: room.id,
          taskType: dto.taskType,
          businessDate,
          priority: dto.priority ?? 'NORMAL',
          note: dto.note,
          createdByStaffUserId: actor.id,
        },
        select: { id: true, taskType: true, priority: true, status: true, businessDate: true },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'HOUSEKEEPING_TASK_CREATED',
        targetType: 'HOUSEKEEPING_TASK',
        targetId: task.id,
        after: {
          taskType: task.taskType,
          priority: task.priority,
          status: task.status,
          businessDate: dateOnly(task.businessDate),
        },
      });
      return transaction.housekeepingTask.findUniqueOrThrow({
        where: { id: task.id },
        select: taskSelect,
      });
    });
    return toTaskDto(record, businessDate, actor);
  }

  async assignTask(
    actor: StaffPrincipal,
    taskId: string,
    dto: AssignHousekeepingTaskDto,
  ): Promise<HousekeepingTaskDto> {
    const record = await this.prisma.$transaction(async (transaction) => {
      await this.lockTask(transaction, taskId);
      const current = await transaction.housekeepingTask.findUnique({ where: { id: taskId } });
      if (!current) throw new NotFoundException({ code: 'HOUSEKEEPING_TASK_NOT_FOUND' });
      if (!activeTaskStatuses.includes(current.status))
        throw domainConflict('TASK_STATUS_CONFLICT');
      const assignee = await transaction.staffUser.findUnique({
        where: { id: dto.assigneeStaffUserId },
        select: { id: true, username: true, role: true, isActive: true },
      });
      if (!assignee || !assignee.isActive || assignee.role !== 'HOUSEKEEPER') {
        throw new BadRequestException({
          code: 'ASSIGNEE_NOT_AVAILABLE',
          message: 'Select an active housekeeper.',
        });
      }
      const nextPriority = dto.priority ?? current.priority;
      if (current.assignedToStaffUserId === assignee.id && current.priority === nextPriority) {
        return transaction.housekeepingTask.findUniqueOrThrow({
          where: { id: taskId },
          select: taskSelect,
        });
      }
      const updated = await transaction.housekeepingTask.update({
        where: { id: taskId },
        data: {
          assignedToStaffUserId: assignee.id,
          assignedAt: new Date(),
          assignedByStaffUserId: actor.id,
          priority: nextPriority,
        },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'HOUSEKEEPING_TASK_ASSIGNED',
        targetType: 'HOUSEKEEPING_TASK',
        targetId: taskId,
        before: {
          ...(current.assignedToStaffUserId
            ? { assignedToStaffUserId: current.assignedToStaffUserId }
            : {}),
          priority: current.priority,
        },
        after: { assignedToStaffUserId: assignee.id, priority: updated.priority },
      });
      return transaction.housekeepingTask.findUniqueOrThrow({
        where: { id: taskId },
        select: taskSelect,
      });
    });
    return toTaskDto(record, record.businessDate, actor);
  }

  async startTask(actor: StaffPrincipal, taskId: string): Promise<HousekeepingTaskDto> {
    const record = await this.prisma.$transaction(async (transaction) => {
      await this.lockTask(transaction, taskId);
      const current = await transaction.housekeepingTask.findUnique({ where: { id: taskId } });
      if (!current) throw new NotFoundException({ code: 'HOUSEKEEPING_TASK_NOT_FOUND' });
      let action: 'START' | 'NO_OP';
      try {
        action = assertTaskCanBeStarted(current, actor);
      } catch (error) {
        ruleException(error);
      }
      if (action === 'NO_OP') {
        return transaction.housekeepingTask.findUniqueOrThrow({
          where: { id: taskId },
          select: taskSelect,
        });
      }
      await transaction.housekeepingTask.update({
        where: { id: taskId },
        data: { status: 'IN_PROGRESS', startedAt: new Date(), startedByStaffUserId: actor.id },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'HOUSEKEEPING_TASK_STARTED',
        targetType: 'HOUSEKEEPING_TASK',
        targetId: taskId,
        before: { status: current.status },
        after: { status: 'IN_PROGRESS', taskType: current.taskType },
      });
      return transaction.housekeepingTask.findUniqueOrThrow({
        where: { id: taskId },
        select: taskSelect,
      });
    });
    return toTaskDto(record, record.businessDate, actor);
  }

  async completeTask(
    actor: StaffPrincipal,
    taskId: string,
    dto: CompleteHousekeepingTaskDto,
  ): Promise<HousekeepingTaskDto> {
    const result = await this.prisma.$transaction(async (transaction) => {
      await this.lockTask(transaction, taskId);
      const current = await transaction.housekeepingTask.findUnique({
        where: { id: taskId },
        include: { room: { select: { id: true, roomTypeId: true, housekeepingStatus: true } } },
      });
      if (!current) throw new NotFoundException({ code: 'HOUSEKEEPING_TASK_NOT_FOUND' });
      let action: 'COMPLETE' | 'NO_OP';
      try {
        action = assertTaskCanBeCompleted(current, actor);
      } catch (error) {
        ruleException(error);
      }
      if (action === 'NO_OP') {
        const record = await transaction.housekeepingTask.findUniqueOrThrow({
          where: { id: taskId },
          select: taskSelect,
        });
        return { record, followUpTaskId: null as string | null };
      }

      await this.capacity.lockRoomType(transaction, current.room.roomTypeId);
      await this.capacity.lockRoom(transaction, current.room.id);
      const room = await transaction.room.findUniqueOrThrow({
        where: { id: current.room.id },
        select: { housekeepingStatus: true, isActive: true },
      });
      if (!room.isActive) throw domainConflict('ROOM_INACTIVE');
      let completion: ReturnType<typeof resolveTaskCompletion>;
      try {
        completion = resolveTaskCompletion({
          taskType: current.taskType,
          outcome: dto.outcome,
          reason: dto.reason,
          roomHousekeepingStatus: room.housekeepingStatus,
        });
      } catch (error) {
        ruleException(error);
      }
      const completedAt = new Date();
      await transaction.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          completedAt,
          completedByStaffUserId: actor.id,
          completionOutcome: dto.outcome,
          completionReason: dto.outcome === 'NEEDS_REWORK' ? dto.reason : null,
        },
      });
      if (completion.nextHousekeepingStatus) {
        await transaction.room.update({
          where: { id: current.room.id },
          data: { housekeepingStatus: completion.nextHousekeepingStatus },
        });
      }
      let followUpTaskId: string | null = null;
      if (completion.followUpTaskType) {
        const followUp = await transaction.housekeepingTask.create({
          data: {
            roomId: current.room.id,
            taskType: completion.followUpTaskType,
            businessDate: current.businessDate,
            priority: current.priority,
            reworkOfTaskId: current.id,
            createdByStaffUserId: actor.id,
            note: 'Follow-up created after a failed inspection.',
          },
          select: { id: true, taskType: true, priority: true },
        });
        followUpTaskId = followUp.id;
        await this.audit.record(transaction, {
          actorStaffUserId: actor.id,
          eventName: 'HOUSEKEEPING_TASK_CREATED',
          targetType: 'HOUSEKEEPING_TASK',
          targetId: followUp.id,
          after: { taskType: followUp.taskType, priority: followUp.priority, status: 'OPEN' },
        });
      }
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'HOUSEKEEPING_TASK_COMPLETED',
        targetType: 'HOUSEKEEPING_TASK',
        targetId: taskId,
        ...(dto.reason ? { reason: dto.reason } : {}),
        before: { status: current.status, housekeepingStatus: room.housekeepingStatus },
        after: {
          status: 'COMPLETED',
          taskType: current.taskType,
          completionOutcome: dto.outcome,
          ...(completion.nextHousekeepingStatus
            ? { housekeepingStatus: completion.nextHousekeepingStatus }
            : {}),
        },
      });
      return {
        record: await transaction.housekeepingTask.findUniqueOrThrow({
          where: { id: taskId },
          select: taskSelect,
        }),
        followUpTaskId,
      };
    });
    return toTaskDto(result.record, result.record.businessDate, actor);
  }

  async cancelTask(
    actor: StaffPrincipal,
    taskId: string,
    reason: string,
  ): Promise<HousekeepingTaskDto> {
    const record = await this.prisma.$transaction(async (transaction) => {
      await this.lockTask(transaction, taskId);
      const current = await transaction.housekeepingTask.findUnique({ where: { id: taskId } });
      if (!current) throw new NotFoundException({ code: 'HOUSEKEEPING_TASK_NOT_FOUND' });
      let action: 'CANCEL' | 'NO_OP';
      try {
        action = assertTaskCanBeCancelled(current, actor, reason);
      } catch (error) {
        ruleException(error);
      }
      if (action === 'NO_OP') {
        return transaction.housekeepingTask.findUniqueOrThrow({
          where: { id: taskId },
          select: taskSelect,
        });
      }
      await transaction.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByStaffUserId: actor.id,
          cancellationReason: reason,
        },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'HOUSEKEEPING_TASK_CANCELLED',
        targetType: 'HOUSEKEEPING_TASK',
        targetId: taskId,
        reason,
        before: { status: current.status },
        after: { status: 'CANCELLED' },
      });
      return transaction.housekeepingTask.findUniqueOrThrow({
        where: { id: taskId },
        select: taskSelect,
      });
    });
    return toTaskDto(record, record.businessDate, actor);
  }

  async listRooms(actor: StaffPrincipal, query: StaffRoomOptionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return this.prisma.$transaction(
      async (transaction) => {
        const hotel = await transaction.hotel.findFirst({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, timezone: true },
        });
        const businessDate = query.businessDate
          ? parseDateOnly(query.businessDate)
          : hotelBusinessDate(hotel?.timezone ?? HOTEL_TIME_ZONE);
        if (!hotel) {
          return {
            businessDate: dateOnly(businessDate),
            items: [] as StaffHousekeepingRoomDto[],
            pagination: pagination(page, pageSize, 0),
          };
        }
        const where: Prisma.RoomWhereInput = {
          hotelId: hotel.id,
          isActive: true,
          ...(query.floor ? { floor: query.floor } : {}),
          ...(actor.role === 'HOUSEKEEPER'
            ? {
                housekeepingTasks: {
                  some: {
                    assignedToStaffUserId: actor.id,
                    status: { in: activeTaskStatuses },
                    businessDate: { lte: businessDate },
                  },
                },
              }
            : {}),
        };
        const [rooms, totalItems] = await Promise.all([
          transaction.room.findMany({
            where,
            orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }, { id: 'asc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
              id: true,
              roomNumber: true,
              floor: true,
              housekeepingStatus: true,
              assignments: {
                where: { isActive: true },
                select: {
                  startDate: true,
                  endDate: true,
                  booking: { select: { status: true, checkIn: true, checkOut: true } },
                },
              },
            },
          }),
          transaction.room.count({ where }),
        ]);
        const items = rooms.map<StaffHousekeepingRoomDto>((room) => {
          const liveAssignments = room.assignments.filter(
            ({ startDate, endDate }) => startDate <= businessDate && endDate > businessDate,
          );
          return {
            id: room.id,
            roomNumber: room.roomNumber,
            floor: room.floor,
            housekeepingStatus: room.housekeepingStatus,
            occupancy: liveAssignments.some(({ booking }) => booking.status === 'CHECKED_IN')
              ? 'OCCUPIED'
              : 'VACANT',
            dueArrival: liveAssignments.some(
              ({ booking }) => booking.status === 'CONFIRMED' && booking.checkIn <= businessDate,
            ),
            dueDeparture: room.assignments.some(
              ({ booking }) => booking.status === 'CHECKED_IN' && booking.checkOut <= businessDate,
            ),
          };
        });
        return {
          businessDate: dateOnly(businessDate),
          items,
          pagination: pagination(page, pageSize, totalItems),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async listAssignees() {
    const items = await this.prisma.staffUser.findMany({
      where: { role: 'HOUSEKEEPER', isActive: true },
      orderBy: [{ username: 'asc' }, { id: 'asc' }],
      select: { id: true, username: true },
    });
    return { items };
  }

  async listDiscrepancies(query: StaffDiscrepancyQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.prisma.$transaction(
      async (transaction) => {
        const hotel = await transaction.hotel.findFirst({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, timezone: true },
        });
        const boardDate = query.businessDate
          ? parseDateOnly(query.businessDate)
          : hotelBusinessDate(hotel?.timezone ?? HOTEL_TIME_ZONE);
        if (!hotel) {
          return {
            businessDate: dateOnly(boardDate),
            items: [] as RoomDiscrepancyDto[],
            pagination: pagination(page, pageSize, 0),
          };
        }
        const where: Prisma.RoomDiscrepancyWhereInput = {
          room: { is: { hotelId: hotel.id, ...(query.roomId ? { id: query.roomId } : {}) } },
          ...(query.businessDate
            ? { businessDate: boardDate }
            : { businessDate: { lte: boardDate } }),
          ...(query.status ? { status: query.status } : { status: 'OPEN' }),
          ...(query.kind ? { kind: query.kind } : {}),
        };
        const [rows, totalItems] = await Promise.all([
          transaction.roomDiscrepancy.findMany({
            where,
            orderBy: [{ businessDate: 'desc' }, { reportedAt: 'desc' }, { id: 'asc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: discrepancySelect,
          }),
          transaction.roomDiscrepancy.count({ where }),
        ]);
        return {
          businessDate: dateOnly(boardDate),
          items: rows.map(toDiscrepancyDto),
          pagination: pagination(page, pageSize, totalItems),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async reportDiscrepancy(actor: StaffPrincipal, roomId: string, dto: ReportRoomDiscrepancyDto) {
    const businessDate = parseDateOnly(dto.businessDate);
    try {
      const record = await this.prisma.$transaction(async (transaction) => {
        const room = await this.lockRoom(transaction, roomId);
        if (!room.isActive) throw domainConflict('ROOM_INACTIVE');
        if (actor.role === 'HOUSEKEEPER') {
          const assignedWork = await transaction.housekeepingTask.findFirst({
            where: {
              roomId,
              businessDate,
              assignedToStaffUserId: actor.id,
              status: { in: activeTaskStatuses },
            },
            select: { id: true },
          });
          if (!assignedWork) throw new ForbiddenException({ code: 'ROOM_WORK_NOT_ASSIGNED' });
        }
        const expectedOccupied = await this.isOccupied(transaction, roomId, businessDate);
        if (expectedOccupied === dto.observedOccupied) {
          throw new BadRequestException({
            code: 'NO_OCCUPANCY_DISCREPANCY',
            message: 'The observation matches recorded occupancy.',
          });
        }
        const kind: RoomDiscrepancyType = expectedOccupied ? 'SKIP' : 'SLEEP';
        const created = await transaction.roomDiscrepancy.create({
          data: {
            roomId,
            businessDate,
            kind,
            expectedOccupied,
            observedOccupied: dto.observedOccupied,
            reportedByStaffUserId: actor.id,
            note: dto.note,
          },
          select: {
            id: true,
            kind: true,
            expectedOccupied: true,
            observedOccupied: true,
            status: true,
          },
        });
        await this.audit.record(transaction, {
          actorStaffUserId: actor.id,
          eventName: 'ROOM_DISCREPANCY_REPORTED',
          targetType: 'ROOM_DISCREPANCY',
          targetId: created.id,
          after: {
            discrepancyType: created.kind,
            expectedOccupied: created.expectedOccupied,
            observedOccupied: created.observedOccupied,
            status: created.status,
            businessDate: dateOnly(businessDate),
            roomId,
          },
        });
        return transaction.roomDiscrepancy.findUniqueOrThrow({
          where: { id: created.id },
          select: discrepancySelect,
        });
      });
      return toDiscrepancyDto(record);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw domainConflict('OPEN_DISCREPANCY_EXISTS');
      }
      throw error;
    }
  }

  async resolveDiscrepancy(actor: StaffPrincipal, discrepancyId: string) {
    const record = await this.prisma.$transaction(async (transaction) => {
      const initial = await transaction.roomDiscrepancy.findUnique({
        where: { id: discrepancyId },
        select: { id: true, roomId: true },
      });
      if (!initial) throw new NotFoundException({ code: 'ROOM_DISCREPANCY_NOT_FOUND' });
      await this.lockRoom(transaction, initial.roomId);
      await this.lockDiscrepancy(transaction, discrepancyId);
      const current = await transaction.roomDiscrepancy.findUnique({
        where: { id: discrepancyId },
      });
      if (!current) throw new NotFoundException({ code: 'ROOM_DISCREPANCY_NOT_FOUND' });
      if (current.status !== 'OPEN') throw domainConflict('DISCREPANCY_NOT_OPEN');
      const occupancy = await this.isOccupied(transaction, current.roomId, current.businessDate);
      if (occupancy !== current.observedOccupied) {
        throw domainConflict(
          'OCCUPANCY_NOT_RECONCILED',
          'Recorded occupancy does not yet match the observation.',
        );
      }
      const updated = await transaction.roomDiscrepancy.update({
        where: { id: discrepancyId },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedByStaffUserId: actor.id },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'ROOM_DISCREPANCY_RESOLVED',
        targetType: 'ROOM_DISCREPANCY',
        targetId: discrepancyId,
        before: { status: current.status, discrepancyType: current.kind },
        after: {
          status: 'RESOLVED',
          discrepancyType: current.kind,
          expectedOccupied: current.expectedOccupied,
          observedOccupied: current.observedOccupied,
        },
      });
      return transaction.roomDiscrepancy.findUniqueOrThrow({
        where: { id: updated.id },
        select: discrepancySelect,
      });
    });
    return toDiscrepancyDto(record);
  }

  async dismissDiscrepancy(actor: StaffPrincipal, discrepancyId: string, reason: string) {
    const record = await this.prisma.$transaction(async (transaction) => {
      await this.lockDiscrepancy(transaction, discrepancyId);
      const current = await transaction.roomDiscrepancy.findUnique({
        where: { id: discrepancyId },
      });
      if (!current) throw new NotFoundException({ code: 'ROOM_DISCREPANCY_NOT_FOUND' });
      if (current.status !== 'OPEN') throw domainConflict('DISCREPANCY_NOT_OPEN');
      const updated = await transaction.roomDiscrepancy.update({
        where: { id: discrepancyId },
        data: {
          status: 'DISMISSED',
          resolvedAt: new Date(),
          resolvedByStaffUserId: actor.id,
          resolutionReason: reason,
        },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actor.id,
        eventName: 'ROOM_DISCREPANCY_DISMISSED',
        targetType: 'ROOM_DISCREPANCY',
        targetId: discrepancyId,
        reason,
        before: { status: current.status, discrepancyType: current.kind },
        after: { status: 'DISMISSED', discrepancyType: current.kind },
      });
      return transaction.roomDiscrepancy.findUniqueOrThrow({
        where: { id: updated.id },
        select: discrepancySelect,
      });
    });
    return toDiscrepancyDto(record);
  }

  private async lockTask(transaction: Prisma.TransactionClient, taskId: string): Promise<void> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "housekeeping_tasks" WHERE "id" = ${taskId}::uuid FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException({ code: 'HOUSEKEEPING_TASK_NOT_FOUND' });
  }

  private async lockDiscrepancy(
    transaction: Prisma.TransactionClient,
    discrepancyId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "room_discrepancies" WHERE "id" = ${discrepancyId}::uuid FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException({ code: 'ROOM_DISCREPANCY_NOT_FOUND' });
  }

  private async lockRoom(transaction: Prisma.TransactionClient, roomId: string) {
    const initial = await transaction.room.findUnique({
      where: { id: roomId },
      select: { id: true, roomTypeId: true },
    });
    if (!initial) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
    await this.capacity.lockRoomType(transaction, initial.roomTypeId);
    await this.capacity.lockRoom(transaction, roomId);
    const room = await transaction.room.findUnique({
      where: { id: roomId },
      select: { id: true, roomTypeId: true, isActive: true },
    });
    if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
    return room;
  }

  private isOccupied(
    transaction: Prisma.TransactionClient,
    roomId: string,
    businessDate: Date,
  ): Promise<boolean> {
    return transaction.roomAssignment
      .count({
        where: {
          roomId,
          isActive: true,
          startDate: { lte: businessDate },
          endDate: { gt: businessDate },
          booking: { status: 'CHECKED_IN' },
        },
      })
      .then((count) => count > 0);
  }
}
