import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { parseDateOnly } from '../availability/date-range';
import { lockBookingByReference } from '../bookings/booking-row-lock';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { assignmentRevision } from './assignment-revision';
import type {
  ReplaceRoomAssignmentsDto,
  RoomAssignmentDto,
  RoomAssignmentSetDto,
} from './dto/room-assignment.dto';
import { RoomCapacityService, type TransactionClient } from './room-capacity.service';

const assignmentSelect = {
  id: true,
  roomId: true,
  startDate: true,
  endDate: true,
  isActive: true,
  updatedAt: true,
} as const;

type Assignment = Prisma.RoomAssignmentGetPayload<{ select: typeof assignmentSelect }>;

function assignmentDto(record: Assignment, reference: string): RoomAssignmentDto {
  return {
    id: record.id,
    roomId: record.roomId,
    reference,
    startDate: record.startDate.toISOString().slice(0, 10),
    endDate: record.endDate.toISOString().slice(0, 10),
    isActive: record.isActive,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function assignmentSetDto(
  revision: string,
  reference: string,
  assignments: Assignment[],
): RoomAssignmentSetDto {
  return {
    revision,
    assignments: assignments.map((assignment) => assignmentDto(assignment, reference)),
  };
}

type AssignmentInterval = Pick<Assignment, 'roomId' | 'startDate' | 'endDate'>;

function intervalKey({ roomId, startDate, endDate }: AssignmentInterval): string {
  return [roomId, startDate.getTime(), endDate.getTime()].join(':');
}

function parseDesiredIntervals(dto: ReplaceRoomAssignmentsDto): AssignmentInterval[] {
  const desired = dto.assignments.map((entry) => {
    const startDate = parseDateOnly(entry.startDate);
    const endDate = parseDateOnly(entry.endDate);
    if (endDate <= startDate) throw new BadRequestException({ code: 'INVALID_DATE_RANGE' });
    return { roomId: entry.roomId.toLowerCase(), startDate, endDate };
  });
  if (new Set(desired.map(({ roomId }) => roomId)).size !== desired.length) {
    throw new ConflictException({ code: 'ROOM_ASSIGNMENT_DUPLICATE_ROOM' });
  }
  return desired.sort((first, second) => first.roomId.localeCompare(second.roomId));
}

@Injectable()
export class RoomAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: RoomCapacityService,
    private readonly audit: AuditService,
  ) {}

  async replace(
    actorStaffUserId: string,
    reference: string,
    dto: ReplaceRoomAssignmentsDto,
  ): Promise<RoomAssignmentSetDto> {
    const desired = parseDesiredIntervals(dto);

    return this.prisma.$transaction(async (transaction) => {
      const lockedBooking = await lockBookingByReference(transaction, reference);
      const { id: bookingId, roomTypeId } = lockedBooking;
      if (lockedBooking.status !== 'CONFIRMED') {
        throw new ConflictException({ code: 'BOOKING_STATUS_CONFLICT' });
      }
      // The booking lock protects the assignment history until this transaction commits.
      const historyQuery = {
        where: { bookingId },
        orderBy: { id: 'asc' },
        select: assignmentSelect,
      } as const;
      const history = await transaction.roomAssignment.findMany(historyQuery);
      const revision = assignmentRevision(bookingId, history);
      const current = history.filter((assignment) => assignment.isActive);
      const currentByInterval = new Map(
        current.map((assignment) => [intervalKey(assignment), assignment]),
      );
      const retained = desired.flatMap((interval) => {
        const assignment = currentByInterval.get(intervalKey(interval));
        return assignment ? [assignment] : [];
      });
      if (current.length === desired.length && retained.length === desired.length) {
        return assignmentSetDto(revision, reference, retained);
      }
      if (dto.expectedRevision !== revision) {
        throw new ConflictException({ code: 'ROOM_ASSIGNMENT_STALE' });
      }
      if (desired.length > lockedBooking.roomQuantity) {
        throw new ConflictException({ code: 'ROOM_ASSIGNMENT_LIMIT' });
      }
      await this.lockAffectedRooms(transaction, roomTypeId, [
        ...current.map(({ roomId }) => roomId),
        ...desired.map(({ roomId }) => roomId),
      ]);

      const booking = await transaction.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { status: true, checkIn: true, checkOut: true },
      });
      if (booking.status !== 'CONFIRMED') {
        throw new ConflictException({ code: 'BOOKING_STATUS_CONFLICT' });
      }
      if (
        desired.some(
          ({ startDate, endDate }) => startDate < booking.checkIn || endDate > booking.checkOut,
        )
      ) {
        throw new ConflictException({ code: 'ROOM_ASSIGNMENT_OUTSIDE_BOOKING' });
      }
      await this.assertRoomsAssignable(transaction, bookingId, roomTypeId, desired);

      const retainedIds = new Set(retained.map(({ id }) => id));
      for (const assignment of current) {
        if (!retainedIds.has(assignment.id)) {
          await this.deactivate(transaction, assignment.id, {
            actorStaffUserId,
            eventName: 'ROOM_UNASSIGNED',
            reason: dto.reason,
          });
        }
      }

      const assignments: Assignment[] = [];
      for (const interval of desired) {
        const previous = currentByInterval.get(intervalKey(interval));
        if (previous) {
          assignments.push(previous);
          continue;
        }
        const assignment = await transaction.roomAssignment.create({
          data: {
            ...interval,
            bookingId,
            roomTypeId,
            assignedByStaffUserId: actorStaffUserId,
            changeReason: dto.reason,
          },
          select: assignmentSelect,
        });
        await this.audit.record(transaction, {
          actorStaffUserId,
          eventName: 'ROOM_ASSIGNED',
          targetType: 'ROOM_ASSIGNMENT',
          targetId: assignment.id,
          reason: dto.reason,
          after: { isActive: true },
        });
        assignments.push(assignment);
      }
      const updatedHistory = await transaction.roomAssignment.findMany(historyQuery);
      return assignmentSetDto(
        assignmentRevision(bookingId, updatedHistory),
        reference,
        assignments,
      );
    });
  }

  // The booking row is already locked by the caller.
  async releaseForCancellation(
    transaction: TransactionClient,
    booking: { id: string; roomTypeId: string },
    actorStaffUserId?: string,
  ): Promise<void> {
    const current = await transaction.roomAssignment.findMany({
      where: { bookingId: booking.id, isActive: true },
      select: { roomId: true },
    });
    await this.lockAffectedRooms(
      transaction,
      booking.roomTypeId,
      current.map(({ roomId }) => roomId),
    );
    const activeAssignments = await transaction.roomAssignment.findMany({
      where: { bookingId: booking.id, isActive: true },
      select: { id: true },
    });
    for (const { id } of activeAssignments) {
      await this.deactivate(
        transaction,
        id,
        actorStaffUserId
          ? { actorStaffUserId, eventName: 'ROOM_ASSIGNMENT_RELEASED_ON_CANCELLATION' }
          : undefined,
      );
    }
  }

  private async lockAffectedRooms(
    transaction: TransactionClient,
    roomTypeId: string,
    roomIds: string[],
  ): Promise<void> {
    await this.capacity.lockRoomType(transaction, roomTypeId);
    for (const roomId of [...new Set(roomIds)].sort()) {
      await this.capacity.lockRoom(transaction, roomId);
    }
  }

  private async assertRoomsAssignable(
    transaction: TransactionClient,
    bookingId: string,
    roomTypeId: string,
    desired: AssignmentInterval[],
  ): Promise<void> {
    if (desired.length === 0) return;
    const rooms = await transaction.room.findMany({
      where: { id: { in: desired.map(({ roomId }) => roomId) } },
      select: { roomTypeId: true, isActive: true },
    });
    if (rooms.length !== desired.length) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
    if (rooms.some((room) => room.roomTypeId !== roomTypeId)) {
      throw new ConflictException({ code: 'ROOM_TYPE_MISMATCH' });
    }
    if (rooms.some((room) => !room.isActive)) {
      throw new ConflictException({ code: 'ROOM_INACTIVE' });
    }

    const overlaps = desired.map(({ roomId, startDate, endDate }) => ({
      roomId,
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    }));
    const occupied = await transaction.roomAssignment.findFirst({
      where: { bookingId: { not: bookingId }, isActive: true, OR: overlaps },
      select: { id: true },
    });
    if (occupied) throw new ConflictException({ code: 'ROOM_ASSIGNMENT_OVERLAP' });

    const blocked = await transaction.roomBlock.findFirst({
      where: { isActive: true, OR: overlaps },
      select: { id: true },
    });
    if (blocked) throw new ConflictException({ code: 'ROOM_BLOCKED' });
  }

  private async deactivate(
    transaction: TransactionClient,
    id: string,
    audit?: { actorStaffUserId: string; eventName: string; reason?: string },
  ): Promise<void> {
    await transaction.roomAssignment.update({
      where: { id },
      data: { isActive: false },
      select: { id: true },
    });
    if (audit) {
      await this.audit.record(transaction, {
        ...audit,
        targetType: 'ROOM_ASSIGNMENT',
        targetId: id,
        before: { isActive: true },
        after: { isActive: false },
      });
    }
  }
}
