import { randomUUID } from 'node:crypto';
import { parseDateOnly } from '../src/availability/date-range';
import { addDays } from '../src/availability/date-range';
import { RoomBoardFixture } from './room-board-fixture';
import type { HousekeepingStatus } from '../src/generated/prisma/enums';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object response body.');
  }
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array response field.');
  return value.map(asRecord);
}

function requiredString(value: unknown, field: string): string {
  const result = asRecord(value)[field];
  if (typeof result !== 'string') throw new Error(`Expected ${field} to be a string.`);
  return result;
}

describe('Housekeeping room options HTTP API', () => {
  const runTag = 'E2E-HPM005-' + randomUUID();
  let fixture: RoomBoardFixture;
  let receptionist: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let cashier: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let manager: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let housekeeper: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let property: Awaited<ReturnType<RoomBoardFixture['createProperty']>>;
  const runBookingIds: string[] = [];
  const runAssignmentIds: string[] = [];
  let originalRoomStatuses: Map<string, HousekeepingStatus>;

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
    property = await fixture.housekeepingProperty();
    originalRoomStatuses = new Map(
      property.rooms.map(({ id, housekeepingStatus }) => [id, housekeepingStatus]),
    );
    receptionist = await fixture.staff('RECEPTIONIST');
    cashier = await fixture.staff('CASHIER');
    manager = await fixture.staff('MANAGER');
    housekeeper = await fixture.staff('HOUSEKEEPER');
  });

  afterAll(async () => {
    if (fixture && manager) {
      if (runAssignmentIds.length > 0) {
        await fixture.prisma.roomAssignment.deleteMany({ where: { id: { in: runAssignmentIds } } });
      }
      if (runBookingIds.length > 0) {
        await fixture.prisma.booking.deleteMany({ where: { id: { in: runBookingIds } } });
      }
      for (const [roomId, housekeepingStatus] of originalRoomStatuses) {
        await fixture.prisma.room.update({ where: { id: roomId }, data: { housekeepingStatus } });
      }
      const unfinished = await fixture.prisma.housekeepingTask.findMany({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          OR: [
            { note: { startsWith: runTag } },
            { reworkOfTask: { is: { note: { startsWith: runTag } } } },
          ],
        },
        select: { id: true, status: true },
      });
      for (const task of unfinished) {
        await fixture.prisma.$transaction(async (transaction) => {
          const update = await transaction.housekeepingTask.updateMany({
            where: { id: task.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancelledByStaffUserId: manager.id,
              cancellationReason: runTag + ' API test cleanup.',
            },
          });
          if (update.count > 0) {
            await transaction.auditEvent.create({
              data: {
                actorStaffUserId: manager.id,
                eventName: 'HOUSEKEEPING_TASK_CANCELLED',
                targetType: 'HOUSEKEEPING_TASK',
                targetId: task.id,
                reason: runTag + ' API test cleanup.',
                before: { status: task.status },
                after: { status: 'CANCELLED' },
              },
            });
          }
        });
      }
      const openReports = await fixture.prisma.roomDiscrepancy.findMany({
        where: { note: { startsWith: runTag }, status: 'OPEN' },
        select: { id: true, kind: true, status: true },
      });
      for (const report of openReports) {
        await fixture.prisma.$transaction(async (transaction) => {
          const update = await transaction.roomDiscrepancy.updateMany({
            where: { id: report.id, status: 'OPEN' },
            data: {
              status: 'DISMISSED',
              resolvedAt: new Date(),
              resolvedByStaffUserId: manager.id,
              resolutionReason: runTag + ' E2E cleanup.',
            },
          });
          if (update.count > 0) {
            await transaction.auditEvent.create({
              data: {
                actorStaffUserId: manager.id,
                eventName: 'ROOM_DISCREPANCY_DISMISSED',
                targetType: 'ROOM_DISCREPANCY',
                targetId: report.id,
                reason: runTag + ' E2E cleanup.',
                before: { status: report.status, discrepancyType: report.kind },
                after: { status: 'DISMISSED', discrepancyType: report.kind },
              },
            });
          }
        });
      }
    }
    await fixture?.close({ preserveData: true });
  });

  it('returns room readiness without guest or billing details', async () => {
    const booking = await fixture.booking(property.type.id);
    await fixture.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CHECKED_IN' },
    });
    await fixture.prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomId: property.rooms[0].id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(fixture.checkIn),
        endDate: parseDateOnly(fixture.checkOut),
        changeReason: runTag + ' temporary occupancy fixture',
      },
    });

    try {
      const response = await fixture
        .client()
        .get('/api/v1/staff/housekeeping/rooms')
        .set(receptionist.headers)
        .query({ businessDate: fixture.checkIn, page: 1, pageSize: 10 })
        .expect(200);

      expect(response.headers['cache-control']).toBe('private, no-store');
      const body = asRecord(response.body);
      expect(body.businessDate).toBe(fixture.checkIn);
      const roomItems = asRecordArray(body.items);
      expect(roomItems.find(({ id }) => id === property.rooms[0].id)).toMatchObject({
        id: property.rooms[0].id,
        roomNumber: '101',
        floor: '1',
        housekeepingStatus: 'INSPECTED',
        occupancy: 'OCCUPIED',
        dueArrival: false,
        dueDeparture: false,
      });
      expect(asRecord(body.pagination)).toMatchObject({
        page: 1,
        pageSize: 10,
        totalItems: 3,
        totalPages: 1,
      });
      expect(JSON.stringify(response.body)).not.toContain('Test Guest');
      expect(JSON.stringify(response.body)).not.toContain(booking.publicReference);
      expect(JSON.stringify(response.body)).not.toContain(booking.guestPhone);
    } finally {
      await fixture.prisma.roomAssignment.deleteMany({ where: { bookingId: booking.id } });
      await fixture.prisma.booking.deleteMany({ where: { id: booking.id } });
    }
  });

  it('denies cashier access to housekeeping room readiness', async () => {
    const response = await fixture
      .client()
      .get('/api/v1/staff/housekeeping/rooms')
      .set(cashier.headers)
      .query({ businessDate: fixture.checkIn })
      .expect(403);

    expect(response.body).toMatchObject({ statusCode: 403 });
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('denies cashier task-board access and manager-only assignee options', async () => {
    const taskBoard = await fixture
      .client()
      .get('/api/v1/staff/housekeeping/tasks')
      .set(cashier.headers)
      .expect(403);
    expect(taskBoard.headers['cache-control']).toBe('private, no-store');

    await fixture
      .client()
      .get('/api/v1/staff/housekeeping/assignees')
      .set(receptionist.headers)
      .expect(403);
  });

  it('lets reception create manual work while denying housekeepers', async () => {
    const body = {
      roomId: property.rooms[0].id,
      taskType: 'GUEST_REQUEST',
      businessDate: fixture.today,
      note: runTag + ' receptionist-created task',
    };
    const created = await fixture
      .client()
      .post('/api/v1/staff/housekeeping/tasks')
      .set(receptionist.headers)
      .send(body)
      .expect(201);
    expect(created.body).toMatchObject({
      taskType: 'GUEST_REQUEST',
      status: 'OPEN',
      dueDate: fixture.today,
    });

    await fixture
      .client()
      .post('/api/v1/staff/housekeeping/tasks')
      .set(housekeeper.headers)
      .send({ ...body, roomId: property.rooms[1].id })
      .expect(403);
  });

  it('serves a private paginated task board to housekeeping-capable staff', async () => {
    const response = await fixture
      .client()
      .get('/api/v1/staff/housekeeping/tasks')
      .set(receptionist.headers)
      .query({ businessDate: fixture.today, page: 1, pageSize: 10 })
      .expect(200);

    expect(response.headers['cache-control']).toBe('private, no-store');
    const body = asRecord(response.body);
    expect(body.businessDate).toBe(fixture.today);
    expect(Array.isArray(body.items)).toBe(true);
    const page = asRecord(body.pagination);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(10);
    expect(typeof page.totalItems).toBe('number');
    expect(typeof page.totalPages).toBe('number');
  });

  it('includes overdue open work and sorts arrival readiness before overdue departure cleans', async () => {
    const arrivalDate = fixture.today;
    const arrivalBooking = await fixture.booking(property.type.id, 1, arrivalDate);
    runBookingIds.push(arrivalBooking.id);
    const arrivalAssignment = await fixture.prisma.roomAssignment.create({
      data: {
        bookingId: arrivalBooking.id,
        roomId: property.rooms[0].id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(arrivalDate),
        endDate: parseDateOnly(arrivalBooking.checkOut.toISOString().slice(0, 10)),
        changeReason: runTag + ' arrival readiness test',
      },
    });
    runAssignmentIds.push(arrivalAssignment.id);
    const departureDate = addDays(arrivalDate, -2);
    const departureBooking = await fixture.booking(property.type.id, 1, departureDate);
    runBookingIds.push(departureBooking.id);
    await fixture.prisma.booking.update({
      where: { id: departureBooking.id },
      data: { status: 'CHECKED_IN' },
    });
    const departureAssignment = await fixture.prisma.roomAssignment.create({
      data: {
        bookingId: departureBooking.id,
        roomId: property.rooms[2].id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(departureBooking.checkIn.toISOString().slice(0, 10)),
        endDate: parseDateOnly(arrivalDate),
        changeReason: runTag + ' overdue departure test',
      },
    });
    runAssignmentIds.push(departureAssignment.id);

    const arrivalTask = await fixture.prisma.housekeepingTask.create({
      data: {
        roomId: property.rooms[0].id,
        taskType: 'INSPECTION',
        businessDate: parseDateOnly(arrivalDate),
        priority: 'NORMAL',
        createdByStaffUserId: manager.id,
        note: runTag + ' arrival task',
      },
    });
    const departureTask = await fixture.prisma.housekeepingTask.create({
      data: {
        roomId: property.rooms[2].id,
        taskType: 'DEPARTURE_CLEAN',
        businessDate: parseDateOnly(addDays(arrivalDate, -1)),
        priority: 'HIGH',
        createdByStaffUserId: manager.id,
        note: runTag + ' overdue departure clean',
      },
    });
    const routineTask = await fixture.prisma.housekeepingTask.create({
      data: {
        roomId: property.rooms[1].id,
        taskType: 'STAYOVER_CLEAN',
        businessDate: parseDateOnly(arrivalDate),
        priority: 'URGENT',
        createdByStaffUserId: manager.id,
        note: runTag + ' routine current work',
      },
    });
    const oldCompletedTask = await fixture.prisma.housekeepingTask.create({
      data: {
        roomId: property.rooms[2].id,
        taskType: 'GUEST_REQUEST',
        businessDate: parseDateOnly(addDays(arrivalDate, -2)),
        status: 'COMPLETED',
        createdByStaffUserId: manager.id,
        completedAt: new Date(),
        completedByStaffUserId: manager.id,
        completionOutcome: 'DONE',
        note: runTag + ' retained historical completion',
      },
    });

    const board = await fixture
      .client()
      .get('/api/v1/staff/housekeeping/tasks')
      .set(receptionist.headers)
      .query({ businessDate: arrivalDate, page: 1, pageSize: 100 })
      .expect(200);

    const items = asRecordArray(asRecord(board.body).items);
    const runTaskIds = new Set([arrivalTask.id, departureTask.id, routineTask.id]);
    expect(
      items.map((item) => requiredString(item, 'id')).filter((id) => runTaskIds.has(id)),
    ).toEqual([arrivalTask.id, departureTask.id, routineTask.id]);
    expect(items.find(({ id }) => id === arrivalTask.id)).toMatchObject({
      dueDate: arrivalDate,
      isOverdue: false,
      arrivalDue: true,
      departureDue: false,
    });
    expect(items.find(({ id }) => id === departureTask.id)).toMatchObject({
      isOverdue: true,
      departureDue: true,
    });
    expect(items.some(({ id }) => id === oldCompletedTask.id)).toBe(false);

    const historical = await fixture
      .client()
      .get('/api/v1/staff/housekeeping/tasks')
      .set(receptionist.headers)
      .query({
        businessDate: arrivalDate,
        dueDate: addDays(arrivalDate, -2),
        page: 1,
        pageSize: 10,
      })
      .expect(200);
    expect(
      asRecordArray(asRecord(historical.body).items).map((item) => requiredString(item, 'id')),
    ).toContain(oldCompletedTask.id);
  });

  it('assigns work, completes idempotently, and leaves a failed inspection re-clean trail', async () => {
    const createTask = (roomId: string, taskType: string) =>
      fixture
        .client()
        .post('/api/v1/staff/housekeeping/tasks')
        .set(manager.headers)
        .send({
          roomId,
          taskType,
          businessDate: fixture.today,
          note: runTag + ' lifecycle task',
        });

    const cleaningResponse = await createTask(property.rooms[0].id, 'DEPARTURE_CLEAN').expect(201);
    const cleaningId = requiredString(cleaningResponse.body, 'id');
    await fixture
      .client()
      .patch('/api/v1/staff/housekeeping/tasks/' + cleaningId + '/assignment')
      .set(manager.headers)
      .send({ assigneeStaffUserId: housekeeper.id })
      .expect(200);
    await fixture
      .client()
      .post('/api/v1/staff/housekeeping/tasks/' + cleaningId + '/start')
      .set(housekeeper.headers)
      .expect(200);
    const completed = await fixture
      .client()
      .post('/api/v1/staff/housekeeping/tasks/' + cleaningId + '/complete')
      .set(housekeeper.headers)
      .send({ outcome: 'DONE' })
      .expect(200);
    const auditCountAfterFirstCompletion = await fixture.prisma.auditEvent.count({
      where: { eventName: 'HOUSEKEEPING_TASK_COMPLETED', targetId: cleaningId },
    });
    const replay = await fixture
      .client()
      .post('/api/v1/staff/housekeeping/tasks/' + cleaningId + '/complete')
      .set(housekeeper.headers)
      .send({ outcome: 'DONE' })
      .expect(200);
    expect(completed.body).toMatchObject({
      id: cleaningId,
      status: 'COMPLETED',
      completionOutcome: 'DONE',
    });
    expect(replay.body).toEqual(completed.body);
    expect(
      await fixture.prisma.auditEvent.count({
        where: { eventName: 'HOUSEKEEPING_TASK_COMPLETED', targetId: cleaningId },
      }),
    ).toBe(auditCountAfterFirstCompletion);
    expect(
      await fixture.prisma.room.findUniqueOrThrow({ where: { id: property.rooms[0].id } }),
    ).toMatchObject({ housekeepingStatus: 'CLEAN' });

    await fixture.prisma.room.update({
      where: { id: property.rooms[1].id },
      data: { housekeepingStatus: 'CLEAN' },
    });
    const inspectionResponse = await createTask(property.rooms[1].id, 'INSPECTION').expect(201);
    const inspectionId = requiredString(inspectionResponse.body, 'id');
    await fixture
      .client()
      .patch('/api/v1/staff/housekeeping/tasks/' + inspectionId + '/assignment')
      .set(manager.headers)
      .send({ assigneeStaffUserId: housekeeper.id })
      .expect(200);
    await fixture
      .client()
      .post('/api/v1/staff/housekeeping/tasks/' + inspectionId + '/start')
      .set(housekeeper.headers)
      .expect(200);
    await fixture
      .client()
      .post('/api/v1/staff/housekeeping/tasks/' + inspectionId + '/complete')
      .set(housekeeper.headers)
      .send({ outcome: 'NEEDS_REWORK', reason: runTag + ' dust remains on the surface.' })
      .expect(200);

    const inspection = await fixture.prisma.housekeepingTask.findUniqueOrThrow({
      where: { id: inspectionId },
    });
    const followUp = await fixture.prisma.housekeepingTask.findUniqueOrThrow({
      where: { reworkOfTaskId: inspectionId },
    });
    expect(inspection).toMatchObject({ status: 'COMPLETED', completionOutcome: 'NEEDS_REWORK' });
    expect(followUp).toMatchObject({ taskType: 'RE_CLEAN', status: 'OPEN' });
    expect(
      await fixture.prisma.room.findUniqueOrThrow({ where: { id: property.rooms[1].id } }),
    ).toMatchObject({ housekeepingStatus: 'DIRTY' });
  });

  it('derives SLEEP and SKIP from live assignments and only resolves matching observations', async () => {
    const reportForRoom = (roomId: string, observedOccupied: boolean) =>
      fixture
        .client()
        .post('/api/v1/staff/housekeeping/rooms/' + roomId + '/discrepancies')
        .set(housekeeper.headers)
        .send({
          businessDate: fixture.today,
          observedOccupied,
          note: runTag + ' occupancy observation',
        });

    const sleepTask = await fixture.prisma.housekeepingTask.create({
      data: {
        roomId: property.rooms[0].id,
        taskType: 'GUEST_REQUEST',
        businessDate: parseDateOnly(fixture.today),
        assignedToStaffUserId: housekeeper.id,
        assignedAt: new Date(),
        assignedByStaffUserId: manager.id,
        createdByStaffUserId: manager.id,
        note: runTag + ' SLEEP report work',
      },
    });
    const sleep = await reportForRoom(property.rooms[0].id, true).expect(201);
    const sleepBody = asRecord(sleep.body);
    const sleepId = requiredString(sleepBody, 'id');
    expect(sleepBody).toMatchObject({
      kind: 'SLEEP',
      expectedOccupied: false,
      observedOccupied: true,
      status: 'OPEN',
      reportedBy: { id: housekeeper.id, username: housekeeper.id },
      resolvedBy: null,
      resolvedAt: null,
      resolutionReason: null,
    });
    expect(asRecord(sleepBody.reportedBy)).not.toHaveProperty('email');
    await fixture
      .client()
      .post('/api/v1/staff/housekeeping/discrepancies/' + sleepId + '/resolve')
      .set(manager.headers)
      .expect(409);
    const dismissed = await fixture
      .client()
      .post('/api/v1/staff/housekeeping/discrepancies/' + sleepId + '/dismiss')
      .set(manager.headers)
      .send({ reason: runTag + ' could not verify the observation.' })
      .expect(200);
    const dismissedBody = asRecord(dismissed.body);
    expect(dismissedBody).toMatchObject({
      status: 'DISMISSED',
      reportedBy: { id: housekeeper.id, username: housekeeper.id },
      resolvedBy: { id: manager.id, username: manager.id },
      resolutionReason: runTag + ' could not verify the observation.',
    });
    expect(typeof dismissedBody.resolvedAt).toBe('string');
    expect(
      await fixture.prisma.housekeepingTask.findUnique({ where: { id: sleepTask.id } }),
    ).not.toBeNull();

    const checkIn = addDays(fixture.today, -1);
    const checkOut = addDays(fixture.today, 1);
    const booking = await fixture.booking(property.type.id, 1, checkIn);
    runBookingIds.push(booking.id);
    await fixture.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CHECKED_IN' },
    });
    const assignment = await fixture.prisma.roomAssignment.create({
      data: {
        bookingId: booking.id,
        roomId: property.rooms[1].id,
        roomTypeId: property.type.id,
        startDate: parseDateOnly(checkIn),
        endDate: parseDateOnly(checkOut),
        changeReason: runTag + ' SKIP occupancy fixture',
      },
    });
    runAssignmentIds.push(assignment.id);
    await fixture.prisma.housekeepingTask.create({
      data: {
        roomId: property.rooms[1].id,
        taskType: 'GUEST_REQUEST',
        businessDate: parseDateOnly(fixture.today),
        assignedToStaffUserId: housekeeper.id,
        assignedAt: new Date(),
        assignedByStaffUserId: manager.id,
        createdByStaffUserId: manager.id,
        note: runTag + ' SKIP report work',
      },
    });
    const skip = await reportForRoom(property.rooms[1].id, false).expect(201);
    const skipBody = asRecord(skip.body);
    const skipId = requiredString(skipBody, 'id');
    expect(skipBody).toMatchObject({
      kind: 'SKIP',
      expectedOccupied: true,
      observedOccupied: false,
      status: 'OPEN',
    });
    await fixture
      .client()
      .post('/api/v1/staff/housekeeping/discrepancies/' + skipId + '/resolve')
      .set(manager.headers)
      .expect(409);

    await fixture.prisma.$transaction(async (transaction) => {
      await transaction.booking.update({
        where: { id: booking.id },
        data: { status: 'CHECKED_OUT' },
      });
      await transaction.roomAssignment.update({
        where: { id: assignment.id },
        data: { isActive: false },
      });
    });
    const resolved = await fixture
      .client()
      .post('/api/v1/staff/housekeeping/discrepancies/' + skipId + '/resolve')
      .set(manager.headers)
      .expect(200);
    const resolvedBody = asRecord(resolved.body);
    expect(resolvedBody).toMatchObject({
      kind: 'SKIP',
      status: 'RESOLVED',
      reportedBy: { id: housekeeper.id, username: housekeeper.id },
      resolvedBy: { id: manager.id, username: manager.id },
      resolutionReason: null,
    });
    expect(typeof resolvedBody.resolvedAt).toBe('string');
  });
});
