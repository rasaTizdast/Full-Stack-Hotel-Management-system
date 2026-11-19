import { randomUUID } from 'node:crypto';
import { RoomBoardFixture } from './room-board-fixture';
import { parseDateOnly } from '../src/availability/date-range';

describe('PostgreSQL housekeeping persistence schema', () => {
  const runTag = 'E2E-HPM005-' + randomUUID();
  let fixture: RoomBoardFixture | undefined;
  let property: Awaited<ReturnType<RoomBoardFixture['createProperty']>>;
  let housekeeper: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let manager: Awaited<ReturnType<RoomBoardFixture['staff']>>;

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
    property = await fixture.housekeepingProperty();
    housekeeper = await fixture.staff('HOUSEKEEPER');
    manager = await fixture.staff('MANAGER');
  });

  afterAll(async () => {
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
    const report = {
      roomId: property.rooms[1].id,
      businessDate: parseDateOnly(fixture!.checkIn),
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
        where: { roomId: property.rooms[1].id, businessDate: parseDateOnly(fixture!.checkIn) },
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
});
