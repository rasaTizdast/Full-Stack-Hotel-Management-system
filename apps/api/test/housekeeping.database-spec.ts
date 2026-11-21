import { randomUUID } from 'node:crypto';
import { RoomBoardFixture } from './room-board-fixture';
import { addDays, parseDateOnly } from '../src/availability/date-range';
import { hotelBusinessDate } from '../src/rooms/room-capacity.service';
import type { HousekeepingStatus } from '../src/generated/prisma/enums';

function optionalResponseString(value: unknown, field: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' ? fieldValue : undefined;
}

function requiredResponseString(value: unknown, field: string): string {
  const result = optionalResponseString(value, field);
  if (result === undefined) throw new Error(`Expected ${field} to be a string.`);
  return result;
}

describe('PostgreSQL housekeeping persistence schema', () => {
  const runTag = 'E2E-HPM005-' + randomUUID();
  const taskIds: string[] = [];
  const discrepancyIds: string[] = [];
  let fixture: RoomBoardFixture | undefined;
  let property: Awaited<ReturnType<RoomBoardFixture['createProperty']>>;
  let housekeeper: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let manager: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  const originalRoomStatuses = new Map<string, HousekeepingStatus>();

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
    property = await fixture.housekeepingProperty();
    for (const { id, housekeepingStatus } of property.rooms) {
      originalRoomStatuses.set(id, housekeepingStatus);
    }
    housekeeper = await fixture.staff('HOUSEKEEPER');
    manager = await fixture.staff('MANAGER');
  });

  afterAll(async () => {
    if (fixture && manager) {
      for (const taskId of taskIds) {
        const task = await fixture.prisma.housekeepingTask.findUnique({
          where: { id: taskId },
          select: { status: true },
        });
        if (task && (task.status === 'OPEN' || task.status === 'IN_PROGRESS')) {
          await fixture
            .client()
            .post('/api/v1/staff/housekeeping/tasks/' + taskId + '/cancel')
            .set(manager.headers)
            .send({ reason: runTag + ' database test cleanup.' })
            .expect(200);
        }
      }
      for (const discrepancyId of discrepancyIds) {
        const report = await fixture.prisma.roomDiscrepancy.findUnique({
          where: { id: discrepancyId },
          select: { status: true },
        });
        if (report?.status === 'OPEN') {
          await fixture
            .client()
            .post('/api/v1/staff/housekeeping/discrepancies/' + discrepancyId + '/dismiss')
            .set(manager.headers)
            .send({ reason: runTag + ' database test cleanup.' })
            .expect(200);
        }
      }
      for (const [roomId, housekeepingStatus] of originalRoomStatuses) {
        await fixture.prisma.room.update({ where: { id: roomId }, data: { housekeepingStatus } });
      }
    }
    await fixture?.close({ preserveData: true });
  });

  it('persists task lifecycle and discrepancy history fields', async () => {
    const columns = await fixture!.prisma.$queryRaw<
      Array<{ tableName: string; columnName: string }>
    >`
      SELECT table_name AS "tableName", column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('housekeeping_tasks', 'room_discrepancies')
    `;
    const byTable = new Map<string, Set<string>>();
    for (const { tableName, columnName } of columns) {
      const tableColumns = byTable.get(tableName) ?? new Set<string>();
      tableColumns.add(columnName);
      byTable.set(tableName, tableColumns);
    }

    expect(byTable.get('housekeeping_tasks')).toEqual(
      new Set([
        'id',
        'room_id',
        'task_type',
        'business_date',
        'priority',
        'status',
        'assigned_to_staff_user_id',
        'assigned_at',
        'assigned_by_staff_user_id',
        'created_by_staff_user_id',
        'created_at',
        'updated_at',
        'started_at',
        'started_by_staff_user_id',
        'completed_at',
        'completed_by_staff_user_id',
        'completion_outcome',
        'completion_reason',
        'rework_of_task_id',
        'cancelled_at',
        'cancelled_by_staff_user_id',
        'cancellation_reason',
        'note',
      ]),
    );
    expect(byTable.get('room_discrepancies')).toEqual(
      new Set([
        'id',
        'room_id',
        'business_date',
        'kind',
        'expected_occupied',
        'observed_occupied',
        'status',
        'reported_by_staff_user_id',
        'reported_at',
        'note',
        'resolved_by_staff_user_id',
        'resolved_at',
        'resolution_reason',
      ]),
    );
  });

  it('retains failed inspection and re-clean linkage while allowing one follow-up per inspection', async () => {
    const inspection = await fixture!.prisma.housekeepingTask.create({
      data: {
        roomId: property.rooms[0].id,
        taskType: 'INSPECTION',
        businessDate: parseDateOnly(fixture!.checkIn),
        status: 'COMPLETED',
        assignedToStaffUserId: housekeeper.id,
        assignedAt: new Date(),
        assignedByStaffUserId: manager.id,
        createdByStaffUserId: manager.id,
        startedAt: new Date(),
        startedByStaffUserId: housekeeper.id,
        completedAt: new Date(),
        completedByStaffUserId: housekeeper.id,
        completionOutcome: 'NEEDS_REWORK',
        completionReason: 'Dust remains in the room.',
        note: runTag + ' failed inspection',
      },
    });
    const followUp = await fixture!.prisma.housekeepingTask.create({
      data: {
        roomId: property.rooms[0].id,
        taskType: 'RE_CLEAN',
        businessDate: parseDateOnly(fixture!.checkIn),
        status: 'COMPLETED',
        startedAt: new Date(),
        startedByStaffUserId: housekeeper.id,
        completedAt: new Date(),
        completedByStaffUserId: housekeeper.id,
        completionOutcome: 'DONE',
        reworkOfTaskId: inspection.id,
        createdByStaffUserId: manager.id,
        note: runTag + ' re-clean fixture',
      },
    });

    expect(followUp.reworkOfTaskId).toBe(inspection.id);
    await expect(
      fixture!.prisma.housekeepingTask.create({
        data: {
          roomId: property.rooms[0].id,
          taskType: 'RE_CLEAN',
          businessDate: parseDateOnly(fixture!.checkIn),
          status: 'COMPLETED',
          startedAt: new Date(),
          startedByStaffUserId: housekeeper.id,
          completedAt: new Date(),
          completedByStaffUserId: housekeeper.id,
          completionOutcome: 'DONE',
          reworkOfTaskId: inspection.id,
          createdByStaffUserId: manager.id,
          note: runTag + ' duplicate re-clean fixture',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('prevents duplicate open room-date discrepancies while retaining dismissed history', async () => {
    let reportRoomId: string | undefined;
    let reportBusinessDate: Date | undefined;
    for (const room of property.rooms) {
      for (let offset = 0; offset < 30 && !reportRoomId; offset += 1) {
        const candidateDate = parseDateOnly(addDays(fixture!.checkIn, offset));
        const openReportCount = await fixture!.prisma.roomDiscrepancy.count({
          where: { roomId: room.id, businessDate: candidateDate, status: 'OPEN' },
        });
        if (openReportCount === 0) {
          reportRoomId = room.id;
          reportBusinessDate = candidateDate;
        }
      }
      if (reportRoomId) break;
    }
    if (!reportRoomId || !reportBusinessDate) {
      throw new Error('Expected an unused room-date pair for the discrepancy uniqueness test.');
    }
    const report = {
      roomId: reportRoomId,
      businessDate: reportBusinessDate,
      kind: 'SLEEP' as const,
      expectedOccupied: false,
      observedOccupied: true,
      reportedByStaffUserId: housekeeper.id,
      note: runTag + ' a person is present in a room recorded vacant.',
    };
    const first = await fixture!.prisma.roomDiscrepancy.create({ data: report });
    await fixture!.prisma.auditEvent.create({
      data: {
        actorStaffUserId: housekeeper.id,
        eventName: 'ROOM_DISCREPANCY_REPORTED',
        targetType: 'ROOM_DISCREPANCY',
        targetId: first.id,
        after: { status: 'OPEN' },
      },
    });

    await expect(fixture!.prisma.roomDiscrepancy.create({ data: report })).rejects.toMatchObject({
      code: 'P2002',
    });

    await fixture!.prisma.roomDiscrepancy.update({
      where: { id: first.id },
      data: {
        status: 'DISMISSED',
        resolvedByStaffUserId: manager.id,
        resolvedAt: new Date(),
        resolutionReason: 'Observation could not be verified.',
      },
    });
    await fixture!.prisma.auditEvent.create({
      data: {
        actorStaffUserId: manager.id,
        eventName: 'ROOM_DISCREPANCY_DISMISSED',
        targetType: 'ROOM_DISCREPANCY',
        targetId: first.id,
        reason: 'Observation could not be verified.',
        before: { status: 'OPEN' },
        after: { status: 'DISMISSED' },
      },
    });
    const laterReport = await fixture!.prisma.roomDiscrepancy.create({
      data: { ...report, note: runTag + ' a later report for the same room and date.' },
    });

    expect(laterReport.id).not.toBe(first.id);
    await expect(
      fixture!.prisma.roomDiscrepancy.findMany({
        where: {
          roomId: reportRoomId,
          businessDate: reportBusinessDate,
          note: { startsWith: runTag },
        },
        orderBy: { reportedAt: 'asc' },
        select: { status: true, kind: true },
      }),
    ).resolves.toEqual([
      { status: 'DISMISSED', kind: 'SLEEP' },
      { status: 'OPEN', kind: 'SLEEP' },
    ]);

    await fixture!.prisma.$transaction(async (transaction) => {
      await transaction.roomDiscrepancy.update({
        where: { id: laterReport.id },
        data: {
          status: 'DISMISSED',
          resolvedByStaffUserId: manager.id,
          resolvedAt: new Date(),
          resolutionReason: 'HPM-005 database test cleanup.',
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorStaffUserId: manager.id,
          eventName: 'ROOM_DISCREPANCY_DISMISSED',
          targetType: 'ROOM_DISCREPANCY',
          targetId: laterReport.id,
          reason: 'HPM-005 database test cleanup.',
          before: { status: 'OPEN' },
          after: { status: 'DISMISSED' },
        },
      });
    });
  });

  it('accepts only the current hotel date for occupancy reports and leaves rejected dates unaudited', async () => {
    const businessDate = hotelBusinessDate(property.hotel.timezone).toISOString().slice(0, 10);
    let reportRoom: (typeof property.rooms)[number] | undefined;
    for (const room of property.rooms) {
      const [activeOccupancy, openReport] = await Promise.all([
        fixture!.prisma.roomAssignment.count({
          where: {
            roomId: room.id,
            isActive: true,
            startDate: { lte: parseDateOnly(businessDate) },
            endDate: { gt: parseDateOnly(businessDate) },
            booking: { status: 'CHECKED_IN' },
          },
        }),
        fixture!.prisma.roomDiscrepancy.count({
          where: {
            roomId: room.id,
            businessDate: parseDateOnly(businessDate),
            status: 'OPEN',
          },
        }),
      ]);
      if (activeOccupancy === 0 && openReport === 0) {
        reportRoom = room;
        break;
      }
    }
    if (!reportRoom) throw new Error('Expected an unoccupied room without an open report.');

    const currentReport = await fixture!
      .client()
      .post('/api/v1/staff/housekeeping/rooms/' + reportRoom.id + '/discrepancies')
      .set(manager.headers)
      .send({
        businessDate,
        observedOccupied: true,
        note: runTag + ' current-date observation',
      })
      .expect(201);
    const currentReportId = requiredResponseString(currentReport.body, 'id');
    discrepancyIds.push(currentReportId);
    expect(currentReport.body).toMatchObject({
      businessDate,
      kind: 'SLEEP',
      expectedOccupied: false,
      observedOccupied: true,
    });
    const reportAudit = await fixture!.prisma.auditEvent.findFirst({
      where: {
        eventName: 'ROOM_DISCREPANCY_REPORTED',
        targetType: 'ROOM_DISCREPANCY',
        targetId: currentReportId,
      },
      select: { actorStaffUserId: true, createdAt: true },
    });
    expect(reportAudit?.actorStaffUserId).toBe(manager.id);
    expect(reportAudit?.createdAt).toBeInstanceOf(Date);

    for (const requestedDate of [addDays(businessDate, -1), addDays(businessDate, 1)]) {
      const reportCountBefore = await fixture!.prisma.roomDiscrepancy.count({
        where: {
          roomId: reportRoom.id,
          businessDate: parseDateOnly(requestedDate),
          note: { startsWith: runTag },
        },
      });
      const auditCountBefore = await fixture!.prisma.auditEvent.count({
        where: { eventName: 'ROOM_DISCREPANCY_REPORTED' },
      });
      const rejected = await fixture!
        .client()
        .post('/api/v1/staff/housekeeping/rooms/' + reportRoom.id + '/discrepancies')
        .set(manager.headers)
        .send({
          businessDate: requestedDate,
          observedOccupied: true,
          note: runTag + ' invalid-date observation',
        });
      const rejectedId = optionalResponseString(rejected.body, 'id');
      if (rejected.status === 201 && rejectedId) {
        discrepancyIds.push(rejectedId);
      }
      expect(rejected.status).toBe(400);
      expect(rejected.body).toMatchObject({ code: 'BUSINESS_DATE_MISMATCH' });
      expect(
        await fixture!.prisma.roomDiscrepancy.count({
          where: {
            roomId: reportRoom.id,
            businessDate: parseDateOnly(requestedDate),
            note: { startsWith: runTag },
          },
        }),
      ).toBe(reportCountBefore);
      expect(
        await fixture!.prisma.auditEvent.count({
          where: { eventName: 'ROOM_DISCREPANCY_REPORTED' },
        }),
      ).toBe(auditCountBefore);
    }

    await fixture!
      .client()
      .post('/api/v1/staff/housekeeping/discrepancies/' + currentReportId + '/dismiss')
      .set(manager.headers)
      .send({ reason: runTag + ' database test cleanup.' })
      .expect(200);
  });

  it('serializes concurrent completion replays and records the completing actor and time once', async () => {
    const created = await fixture!
      .client()
      .post('/api/v1/staff/housekeeping/tasks')
      .set(manager.headers)
      .send({
        roomId: property.rooms[0].id,
        taskType: 'DEPARTURE_CLEAN',
        businessDate: fixture!.today,
        note: runTag + ' concurrent completion test',
      })
      .expect(201);
    const taskId = requiredResponseString(created.body, 'id');
    taskIds.push(taskId);
    await fixture!
      .client()
      .patch('/api/v1/staff/housekeeping/tasks/' + taskId + '/assignment')
      .set(manager.headers)
      .send({ assigneeStaffUserId: housekeeper.id })
      .expect(200);
    await fixture!
      .client()
      .post('/api/v1/staff/housekeeping/tasks/' + taskId + '/start')
      .set(housekeeper.headers)
      .expect(200);

    const completions = await Promise.all([
      fixture!
        .client()
        .post('/api/v1/staff/housekeeping/tasks/' + taskId + '/complete')
        .set(housekeeper.headers)
        .send({ outcome: 'DONE' })
        .expect(200),
      fixture!
        .client()
        .post('/api/v1/staff/housekeeping/tasks/' + taskId + '/complete')
        .set(housekeeper.headers)
        .send({ outcome: 'DONE' })
        .expect(200),
    ]);
    expect(completions[0].body).toEqual(completions[1].body);
    expect(completions[0].body).toMatchObject({
      id: taskId,
      status: 'COMPLETED',
      completionOutcome: 'DONE',
    });

    const completedTask = await fixture!.prisma.housekeepingTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { completedByStaffUserId: true, completedAt: true },
    });
    expect(completedTask.completedByStaffUserId).toBe(housekeeper.id);
    expect(completedTask.completedAt).toBeInstanceOf(Date);

    const completionEvents = await fixture!.prisma.auditEvent.findMany({
      where: {
        eventName: 'HOUSEKEEPING_TASK_COMPLETED',
        targetType: 'HOUSEKEEPING_TASK',
        targetId: taskId,
      },
      select: { actorStaffUserId: true, createdAt: true, before: true, after: true },
    });
    expect(completionEvents).toHaveLength(1);
    expect(completionEvents[0]).toMatchObject({
      actorStaffUserId: housekeeper.id,
      before: { status: 'IN_PROGRESS' },
      after: { status: 'COMPLETED', taskType: 'DEPARTURE_CLEAN', completionOutcome: 'DONE' },
    });
    expect(completionEvents[0]?.createdAt).toBeInstanceOf(Date);
  });
});
