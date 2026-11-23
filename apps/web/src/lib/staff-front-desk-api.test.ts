import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  amendStaffStay,
  checkInStaffStay,
  createStaffWalkIn,
  extendStaffStay,
  getStaffStayWorklist,
  moveStaffStayRoom,
  markStaffStayNoShow,
} from './staff-front-desk-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('staff front-desk API', () => {
  it('loads a dated and searched worklist through the private staff client', async () => {
    const response = {
      date: '2026-11-18',
      businessDate: '2026-11-18',
      items: [],
      pagination: { page: 2, pageSize: 10, totalItems: 11, totalPages: 2 },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getStaffStayWorklist('arrivals', {
        date: '2026-11-18',
        search: 'مریم رضایی',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/front-desk/arrivals?date=2026-11-18&search=%D9%85%D8%B1%DB%8C%D9%85+%D8%B1%D8%B6%D8%A7%DB%8C%DB%8C&page=2&pageSize=10',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('reuses the supplied idempotency key and CSRF token for walk-in retries', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ reference: 'WALKIN123456', status: 'CONFIRMED' })),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      roomTypeSlug: 'garden-double',
      checkIn: '2026-11-18',
      checkOut: '2026-11-20',
      guestCount: 2,
      roomQuantity: 1,
      guestName: 'مریم رضایی',
      guestPhone: '09120000000',
    };

    await createStaffWalkIn(input, 'csrf-front-desk', 'walk-in-key-000001');
    await createStaffWalkIn(input, 'csrf-front-desk', 'walk-in-key-000001');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/api/v1/staff/bookings/walk-ins',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({
          'X-CSRF-Token': 'csrf-front-desk',
          'Idempotency-Key': 'walk-in-key-000001',
        }),
        body: JSON.stringify(input),
      }),
    );
    expect(fetchMock.mock.calls[1]).toEqual(fetchMock.mock.calls[0]);
  });

  it('sends lifecycle actions with CSRF and the exact reviewed payloads', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ reference: 'ABC123456789', status: 'CHECKED_IN' })),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await checkInStaffStay('ABC123456789', 'csrf', { earlyCheckInReason: 'دلیل ثبت‌شده' });
    await markStaffStayNoShow('ABC123456789', 'csrf', { reason: 'تماس بی‌پاسخ' });
    await amendStaffStay('ABC123456789', 'csrf', { checkOut: '2026-11-22', roomQuantity: 2 });
    await moveStaffStayRoom('ABC123456789', 'csrf', {
      sourceAssignmentId: 'source-id',
      targetRoomId: 'target-id',
      reason: 'خرابی شیر آب',
    });
    await extendStaffStay('ABC123456789', 'csrf', {
      checkOut: '2026-11-26',
      reason: 'درخواست مهمان',
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:4000/api/v1/staff/bookings/ABC123456789/check-in',
      'http://localhost:4000/api/v1/staff/bookings/ABC123456789/no-show',
      'http://localhost:4000/api/v1/staff/bookings/ABC123456789',
      'http://localhost:4000/api/v1/staff/bookings/ABC123456789/room-move',
      'http://localhost:4000/api/v1/staff/bookings/ABC123456789/extend',
    ]);
    expect(fetchMock.mock.calls.map(([, options]) => options)).toEqual([
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }),
        body: JSON.stringify({ earlyCheckInReason: 'دلیل ثبت‌شده' }),
      }),
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }),
        body: JSON.stringify({ reason: 'تماس بی‌پاسخ' }),
      }),
      expect.objectContaining({
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }),
        body: JSON.stringify({ checkOut: '2026-11-22', roomQuantity: 2 }),
      }),
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }),
        body: JSON.stringify({
          sourceAssignmentId: 'source-id',
          targetRoomId: 'target-id',
          reason: 'خرابی شیر آب',
        }),
      }),
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }),
        body: JSON.stringify({ checkOut: '2026-11-26', reason: 'درخواست مهمان' }),
      }),
    ]);
  });
});
