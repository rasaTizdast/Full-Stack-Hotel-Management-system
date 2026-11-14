import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelStaffBooking,
  confirmStaffBooking,
  getStaffBooking,
  listStaffBookings,
  rejectStaffBooking,
} from './staff-bookings-api';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('staff bookings API', () => {
  it('requests an authorized booking page using the supported filters', async () => {
    vi.stubEnv('NEXT_PUBLIC_HOTEL_API_BASE_URL', 'http://localhost:4016/api/v1');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], pagination: { page: 2, pageSize: 10 } }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listStaffBookings({
      status: 'CONFIRMED',
      arrivalFrom: '2026-11-20',
      arrivalTo: '2026-11-23',
      search: '  09123456789  ',
      page: 2,
      pageSize: 10,
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://localhost:4016/api/v1/staff/bookings?status=CONFIRMED&arrivalFrom=2026-11-20&arrivalTo=2026-11-23&search=09123456789&page=2&pageSize=10',
    );
    expect(options).toMatchObject({ credentials: 'include', cache: 'no-store' });
  });

  it('loads only the requested booking detail and safely encodes its reference', async () => {
    const booking = { reference: 'HB/26-AB', status: 'PENDING_CONFIRMATION' };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(booking), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStaffBooking('HB/26-AB')).resolves.toMatchObject(booking);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:4000/api/v1/staff/bookings/HB%2F26-AB',
    );
  });

  it('sends CSRF-protected confirm, reject, and cancel actions', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ reference: 'HB-26-AB', status: 'CONFIRMED' }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await confirmStaffBooking('HB-26-AB', 'csrf-memory', { internalNote: 'تلفنی بررسی شد' });
    await rejectStaffBooking('HB-26-AB', 'csrf-memory', { internalNote: 'ظرفیت کافی نیست' });
    await cancelStaffBooking('HB-26-AB', 'csrf-memory', { reason: 'درخواست مهمان' });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:4000/api/v1/staff/bookings/HB-26-AB/confirm',
      'http://localhost:4000/api/v1/staff/bookings/HB-26-AB/reject',
      'http://localhost:4000/api/v1/staff/bookings/HB-26-AB/cancel',
    ]);
    expect(fetchMock.mock.calls.map(([, options]) => options)).toEqual([
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-memory' }),
        body: JSON.stringify({ internalNote: 'تلفنی بررسی شد' }),
      }),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-memory' }),
        body: JSON.stringify({ internalNote: 'ظرفیت کافی نیست' }),
      }),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-memory' }),
        body: JSON.stringify({ reason: 'درخواست مهمان' }),
      }),
    ]);
  });

  it('preserves conflict status for current-state recovery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 409,
            code: 'BOOKING_STATE_CONFLICT',
            message: 'The booking cannot be changed from its current status.',
          }),
          { status: 409 },
        ),
      ),
    );

    await expect(confirmStaffBooking('HB-26-AB', 'csrf-memory')).rejects.toMatchObject({
      status: 409,
    });
  });
});
