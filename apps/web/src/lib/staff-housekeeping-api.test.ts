import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignStaffHousekeepingTask,
  cancelStaffHousekeepingTask,
  completeStaffHousekeepingTask,
  createStaffHousekeepingTask,
  dismissStaffHousekeepingDiscrepancy,
  getStaffHousekeepingAssignees,
  getStaffHousekeepingDiscrepancies,
  getStaffHousekeepingRooms,
  getStaffHousekeepingTasks,
  reportStaffRoomDiscrepancy,
  resolveStaffHousekeepingDiscrepancy,
  startStaffHousekeepingTask,
} from './staff-housekeeping-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('staff housekeeping API client', () => {
  it('serializes the staff-worklist filters and uses private fetch settings', async () => {
    const response = {
      businessDate: '2026-11-17',
      items: [],
      pagination: { page: 2, pageSize: 10, totalItems: 13, totalPages: 2 },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStaffHousekeepingTasks({
      businessDate: '2026-11-17',
      dueDate: '2026-11-18',
      page: 2,
      pageSize: 10,
      roomId: 'room/101',
      floor: '۲',
      taskType: 'INSPECTION',
      assigneeStaffUserId: 'staff/3',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/housekeeping/tasks?businessDate=2026-11-17&dueDate=2026-11-18&page=2&pageSize=10&roomId=room%2F101&floor=%DB%B2&taskType=INSPECTION&assigneeStaffUserId=staff%2F3&status=IN_PROGRESS&priority=HIGH',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('sends create, assignment, start, completion, and cancellation through their documented routes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const token = 'housekeeping-csrf';

    await createStaffHousekeepingTask({
      roomId: 'room-101',
      taskType: 'DEPARTURE_CLEAN',
      businessDate: '2026-11-17',
      priority: 'URGENT',
      note: 'آماده‌سازی پیش از ورود',
    }, token);
    await assignStaffHousekeepingTask('task/1', { assigneeStaffUserId: 'staff/2', priority: 'HIGH' }, token);
    await startStaffHousekeepingTask('task/1', token);
    await completeStaffHousekeepingTask('task/1', { outcome: 'NEEDS_REWORK', reason: 'بازبینی دوبارهٔ حمام' }, token);
    await cancelStaffHousekeepingTask('task/1', { reason: 'درخواست مهمان لغو شد' }, token);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:4000/api/v1/staff/housekeeping/tasks', expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: expect.objectContaining({ 'X-CSRF-Token': token }),
      body: JSON.stringify({ roomId: 'room-101', taskType: 'DEPARTURE_CLEAN', businessDate: '2026-11-17', priority: 'URGENT', note: 'آماده‌سازی پیش از ورود' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:4000/api/v1/staff/housekeeping/tasks/task%2F1/assignment', expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ 'X-CSRF-Token': token }),
      body: JSON.stringify({ assigneeStaffUserId: 'staff/2', priority: 'HIGH' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://localhost:4000/api/v1/staff/housekeeping/tasks/task%2F1/start', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': token }) }));
    expect(fetchMock.mock.calls[2][1]).not.toHaveProperty('body');
    expect(fetchMock).toHaveBeenNthCalledWith(4, 'http://localhost:4000/api/v1/staff/housekeeping/tasks/task%2F1/complete', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-CSRF-Token': token }),
      body: JSON.stringify({ outcome: 'NEEDS_REWORK', reason: 'بازبینی دوبارهٔ حمام' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, 'http://localhost:4000/api/v1/staff/housekeeping/tasks/task%2F1/cancel', expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'درخواست مهمان لغو شد' }) }));
  });

  it('lists discrepancy and picker data, then reports, resolves, and dismisses discrepancies', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"items":[],"businessDate":"2026-11-17","pagination":{"page":1,"pageSize":20,"totalItems":0,"totalPages":0}}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const token = 'housekeeping-csrf';

    await getStaffHousekeepingDiscrepancies({ businessDate: '2026-11-17', page: 1, pageSize: 20, roomId: 'room-101' });
    await getStaffHousekeepingRooms();
    await getStaffHousekeepingAssignees();
    await reportStaffRoomDiscrepancy('room/101', { businessDate: '2026-11-17', observedOccupied: true, note: 'صدای حضور داخل اتاق شنیده شد' }, token);
    await resolveStaffHousekeepingDiscrepancy('discrepancy/1', token);
    await dismissStaffHousekeepingDiscrepancy('discrepancy/2', { reason: 'مشاهده پس از بررسی تأیید نشد' }, token);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:4000/api/v1/staff/housekeeping/discrepancies?businessDate=2026-11-17&page=1&pageSize=20&roomId=room-101', expect.objectContaining({ cache: 'no-store', credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:4000/api/v1/staff/housekeeping/rooms', expect.objectContaining({ cache: 'no-store', credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://localhost:4000/api/v1/staff/housekeeping/assignees', expect.objectContaining({ cache: 'no-store', credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, 'http://localhost:4000/api/v1/staff/housekeeping/rooms/room%2F101/discrepancies', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': token }), body: JSON.stringify({ businessDate: '2026-11-17', observedOccupied: true, note: 'صدای حضور داخل اتاق شنیده شد' }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, 'http://localhost:4000/api/v1/staff/housekeeping/discrepancies/discrepancy%2F1/resolve', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': token }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, 'http://localhost:4000/api/v1/staff/housekeeping/discrepancies/discrepancy%2F2/dismiss', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': token }), body: JSON.stringify({ reason: 'مشاهده پس از بررسی تأیید نشد' }) }));
  });

  it('returns room options from the paginated room envelope and assignees from their items envelope', async () => {
    const rooms = {
      businessDate: '2026-11-17',
      items: [{
        id: 'room-101',
        roomNumber: '۱۰۱',
        floor: '۲',
        housekeepingStatus: 'DIRTY',
        occupancy: 'VACANT',
        dueArrival: true,
        dueDeparture: false,
      }],
      pagination: { page: 2, pageSize: 50, totalItems: 51, totalPages: 2 },
    };
    const assignees = { items: [{ id: 'staff-1', username: 'attendant-1' }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(rooms), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(assignees), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStaffHousekeepingRooms({ page: 2, pageSize: 50, floor: '۲' })).resolves.toEqual(rooms);
    await expect(getStaffHousekeepingAssignees()).resolves.toEqual(assignees);

    expect(fetchMock).toHaveBeenNthCalledWith(1,
      'http://localhost:4000/api/v1/staff/housekeeping/rooms?page=2&pageSize=50&floor=%DB%B2',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      'http://localhost:4000/api/v1/staff/housekeeping/assignees',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });
});
