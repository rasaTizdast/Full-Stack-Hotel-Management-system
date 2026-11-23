import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignStaffMaintenanceRequest,
  createStaffMaintenanceRequest,
  createStaffRoomBlock,
  getStaffMaintenanceAssignees,
  getStaffMaintenanceRequests,
  getStaffMaintenanceRooms,
  getStaffRoomBlocks,
  resolveStaffMaintenanceRequest,
  restoreStaffRoomBlock,
} from './staff-maintenance-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('staff maintenance API client', () => {
  it('serializes repair and block filters using private fetch settings', async () => {
    const response = {
      items: [],
      pagination: { page: 2, pageSize: 10, totalItems: 11, totalPages: 2 },
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(response), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getStaffMaintenanceRequests({
        page: 2,
        pageSize: 10,
        roomId: 'room/101',
        floor: '۲',
        category: 'PLUMBING',
        priority: 'HIGH',
        status: 'OPEN',
        assigneeStaffUserId: 'staff/3',
        expectedDate: '2026-11-25',
      }),
    ).resolves.toEqual(response);
    await getStaffRoomBlocks({
      page: 1,
      pageSize: 20,
      floor: '۲',
      kind: 'OUT_OF_ORDER',
      status: 'ACTIVE',
      activeOn: '2026-11-25',
      expectedReturnDate: '2026-11-27',
      reason: 'شیر آب',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/api/v1/staff/maintenance/requests?page=2&pageSize=10&roomId=room%2F101&floor=%DB%B2&category=PLUMBING&priority=HIGH&status=OPEN&assigneeStaffUserId=staff%2F3&expectedDate=2026-11-25',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:4000/api/v1/staff/maintenance/blocks?page=1&pageSize=20&floor=%DB%B2&kind=OUT_OF_ORDER&status=ACTIVE&activeOn=2026-11-25&expectedReturnDate=2026-11-27&reason=%D8%B4%DB%8C%D8%B1+%D8%A2%D8%A8',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('posts requests, assignment, resolution, and room blocks with CSRF and no-store', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const csrfToken = 'maintenance-csrf';

    await createStaffMaintenanceRequest(
      {
        roomId: 'room-101',
        category: 'PLUMBING',
        description: 'شیر روشویی نشتی دارد',
        priority: 'HIGH',
        expectedDate: '2026-11-25',
      },
      csrfToken,
    );
    await assignStaffMaintenanceRequest('request/1', { assigneeStaffUserId: 'staff-2' }, csrfToken);
    await resolveStaffMaintenanceRequest(
      'request/1',
      { resolutionNote: 'واشر تعویض شد' },
      csrfToken,
    );
    await createStaffRoomBlock(
      {
        roomId: 'room-101',
        startDate: '2026-11-25',
        endDate: '2026-11-27',
        kind: 'OUT_OF_ORDER',
        reason: 'تعمیر لوله‌کشی',
      },
      csrfToken,
    );
    await restoreStaffRoomBlock('block/1', { reason: 'اتاق برای فروش آماده است' }, csrfToken);
    await getStaffMaintenanceAssignees();
    await getStaffMaintenanceRooms();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/api/v1/staff/maintenance/requests',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': csrfToken }),
        body: JSON.stringify({
          roomId: 'room-101',
          category: 'PLUMBING',
          description: 'شیر روشویی نشتی دارد',
          priority: 'HIGH',
          expectedDate: '2026-11-25',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:4000/api/v1/staff/maintenance/requests/request%2F1/assignment',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'X-CSRF-Token': csrfToken }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:4000/api/v1/staff/maintenance/requests/request%2F1/resolve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ resolutionNote: 'واشر تعویض شد' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:4000/api/v1/staff/maintenance/blocks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-CSRF-Token': csrfToken }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://localhost:4000/api/v1/staff/maintenance/blocks/block%2F1/restore',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'اتاق برای فروش آماده است' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://localhost:4000/api/v1/staff/maintenance/assignees',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'http://localhost:4000/api/v1/staff/maintenance/rooms',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });
});
