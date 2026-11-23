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

type CheckedInRoomMove = {
  booking: { id: string; roomTypeId: string };
  actorStaffUserId: string;
  sourceAssignmentId: string;
  targetRoomId: string;
  businessDate: Date;
  checkOut: Date;
  reason: string;
};

function inactiveMoveSource(): ConflictException {
  return new ConflictException({ code: 'ROOM_MOVE_SOURCE_NOT_ASSIGNED' });
}

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
    await this.lockAssignedRooms(transaction, booking);
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

  // Call after locking the booking so assignment changes cannot add a room to the set.
  async lockAssignedRooms(
    transaction: TransactionClient,
    booking: { id: string; roomTypeId: string },
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
  }

  // The booking, its room type, and assigned rooms are already locked.
  async assertAmendmentFitsAssignments(
    transaction: TransactionClient,
    booking: { id: string; roomTypeId: string },
    startDate: Date,
    endDate: Date,
    roomQuantity: number,
  ): Promise<void> {
    const active = await transaction.roomAssignment.findMany({
      where: { bookingId: booking.id, isActive: true },
      select: { roomId: true, startDate: true, endDate: true },
    });
    if (active.length > roomQuantity) {
      throw new ConflictException({ code: 'ROOM_ASSIGNMENT_LIMIT' });
    }
    if (active.some((interval) => interval.startDate < startDate || interval.endDate > endDate)) {
      throw new ConflictException({ code: 'ROOM_ASSIGNMENT_OUTSIDE_BOOKING' });
    }
    await this.assertRoomsAssignable(transaction, booking.id, booking.roomTypeId, active);
  }

  // The caller holds the booking, room type, and active room locks.
  async assertInHouseExtensionFits(
    transaction: TransactionClient,
    booking: { id: string; roomTypeId: string; roomQuantity: number },
    oldCheckOut: Date,
    newCheckOut: Date,
  ): Promise<void> {
    const active = await transaction.roomAssignment.findMany({
      where: { bookingId: booking.id, isActive: true },
      select: { roomId: true, startDate: true, endDate: true },
    });
    if (
      active.length !== booking.roomQuantity ||
      active.some(
        ({ startDate, endDate }) =>
          startDate >= oldCheckOut || endDate.getTime() !== oldCheckOut.getTime(),
      )
    ) {
      throw new ConflictException({ code: 'ROOM_ASSIGNMENT_INCOMPLETE' });
    }
    await this.assertRoomsAssignable(
      transaction,
      booking.id,
      booking.roomTypeId,
      active.map(({ roomId }) => ({ roomId, startDate: oldCheckOut, endDate: newCheckOut })),
    );
  }

  // The caller holds the booking lock, which also protects the assignment identity.
  async lockRoomsForMove(
    transaction: TransactionClient,
    booking: CheckedInRoomMove['booking'],
    sourceAssignmentId: string,
    targetRoomId: string,
  ): Promise<void> {
    const source = await transaction.roomAssignment.findUnique({
      where: { id: sourceAssignmentId, bookingId: booking.id },
      select: { roomId: true },
    });
    if (!source) throw inactiveMoveSource();
    await this.lockAffectedRooms(transaction, booking.roomTypeId, [source.roomId, targetRoomId]);
  }

  // The caller holds the booking, room type, and both room locks.
  async moveCheckedInRoom(transaction: TransactionClient, move: CheckedInRoomMove): Promise<void> {
    const {
      booking,
      actorStaffUserId,
      sourceAssignmentId,
      targetRoomId,
      businessDate,
      checkOut,
      reason,
    } = move;
    const source = await transaction.roomAssignment.findUnique({
      where: {
        id: sourceAssignmentId,
        bookingId: booking.id,
        isActive: true,
        startDate: { lte: businessDate },
        endDate: { gt: businessDate },
      },
      select: { roomId: true, startDate: true },
    });
    if (!source) throw inactiveMoveSource();
    if (source.roomId === targetRoomId) {
      throw new ConflictException({ code: 'ROOM_ASSIGNMENT_DUPLICATE_ROOM' });
    }

    const target = { roomId: targetRoomId, startDate: businessDate, endDate: checkOut };
    await this.assertRoomsAssignable(transaction, undefined, booking.roomTypeId, [target], true);

    await transaction.roomAssignment.update({
      where: { id: sourceAssignmentId },
      data: {
        isActive: false,
        // Same-day moves preserve a nonzero interval. The audit records the effective date.
        endDate: source.startDate < businessDate ? businessDate : undefined,
      },
    });
    await transaction.roomAssignment.create({
      data: {
        ...target,
        bookingId: booking.id,
        roomTypeId: booking.roomTypeId,
        assignedByStaffUserId: actorStaffUserId,
        changeReason: reason,
      },
      select: { id: true },
    });
    await transaction.room.update({
      where: { id: source.roomId },
      data: { housekeepingStatus: 'DIRTY' },
      select: { id: true },
    });
    await this.audit.record(transaction, {
      actorStaffUserId,
      eventName: 'BOOKING_ROOM_MOVE',
      targetType: 'BOOKING',
      targetId: booking.id,
      reason,
      before: { roomId: source.roomId },
      after: { roomId: targetRoomId, effectiveDate: businessDate.toISOString().slice(0, 10) },
    });
  }

  // The booking, its room type, and assigned rooms are already locked.
  async assertCheckInReadiness(
    transaction: TransactionClient,
    booking: { id: string; roomTypeId: string; roomQuantity: number },
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    const assignments = await transaction.roomAssignment.findMany({
      where: {
        bookingId: booking.id,
        isActive: true,
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
      select: { roomId: true, startDate: true, endDate: true },
    });
    const remaining = assignments.map((assignment) => ({
      roomId: assignment.roomId,
      startDate: assignment.startDate > startDate ? assignment.startDate : startDate,
      endDate: assignment.endDate < endDate ? assignment.endDate : endDate,
    }));
    for (let date = startDate.getTime(); date < endDate.getTime(); date += 86_400_000) {
      const rooms = new Set(
        remaining
          .filter(
            (interval) => interval.startDate.getTime() <= date && date < interval.endDate.getTime(),
          )
          .map(({ roomId }) => roomId),
      );
      if (rooms.size !== booking.roomQuantity) {
        throw new ConflictException({
          code: 'ROOM_ASSIGNMENT_INCOMPLETE',
          message: 'Assign one distinct room per booked unit for every remaining night.',
        });
      }
    }
    await this.assertRoomsAssignable(transaction, booking.id, booking.roomTypeId, remaining, true);
  }

  // The caller records assignment release in the single booking no-show event.
  async deactivateForNoShow(transaction: TransactionClient, bookingId: string): Promise<void> {
    await transaction.roomAssignment.updateMany({
      where: { bookingId, isActive: true },
      data: { isActive: false },
    });
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
    excludedBookingId: string | undefined,
    roomTypeId: string,
    desired: AssignmentInterval[],
    requireInspected = false,
  ): Promise<void> {
    if (desired.length === 0) return;
    const roomIds = [...new Set(desired.map(({ roomId }) => roomId))];
    const rooms = await transaction.room.findMany({
      where: { id: { in: roomIds } },
      select: { roomTypeId: true, isActive: true, housekeepingStatus: true },
    });
    if (rooms.length !== roomIds.length) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
    if (rooms.some((room) => room.roomTypeId !== roomTypeId)) {
      throw new ConflictException({ code: 'ROOM_TYPE_MISMATCH' });
    }
    if (rooms.some((room) => !room.isActive)) {
      throw new ConflictException({ code: 'ROOM_INACTIVE' });
    }
    if (requireInspected && rooms.some((room) => room.housekeepingStatus !== 'INSPECTED')) {
      throw new ConflictException({
        code: 'ROOM_NOT_INSPECTED',
        message: 'Assigned rooms must be inspected before check-in.',
      });
    }

    const overlaps = desired.map(({ roomId, startDate, endDate }) => ({
      roomId,
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    }));
    const occupied = await transaction.roomAssignment.findFirst({
      where: {
        bookingId: excludedBookingId ? { not: excludedBookingId } : undefined,
        isActive: true,
        OR: overlaps,
      },
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
