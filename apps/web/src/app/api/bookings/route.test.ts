import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const bookingResponse = {
  reference: 'N8rP4vQkL2dX',
  status: 'PENDING_CONFIRMATION',
  checkIn: '2026-11-15',
  checkOut: '2026-11-17',
  guestCount: 2,
  roomQuantity: 1,
  roomType: { slug: 'garden-double', name: 'اتاق دوتخته باغ' },
  priceSummary: {
    numberOfNights: 2,
    totalPriceToman: '4800000',
    nights: [
      {
        stayDate: '2026-11-15',
        nightlyPriceToman: '2400000',
        roomQuantity: 1,
        amountToman: '2400000',
      },
      {
        stayDate: '2026-11-16',
        nightlyPriceToman: '2400000',
        roomQuantity: 1,
        amountToman: '2400000',
      },
    ],
  },
};

describe('POST /api/bookings', () => {
  it('forwards only booking fields and the idempotency key to the configured API', async () => {
    vi.stubEnv('HOTEL_API_BASE_URL', 'http://api.example.test/api/v1/');
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          ...bookingResponse,
          internalId: 'must-not-reach-browser',
          guestPhone: '+989123456789',
          guestEmail: 'private@example.test',
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const booking = {
      roomTypeSlug: 'garden-double',
      checkIn: '2026-11-15',
      checkOut: '2026-11-17',
      guestCount: 2,
      roomQuantity: 1,
      guestName: 'مهمان آزمایشی',
      guestPhone: '+989123456789',
      guestEmail: 'guest@example.com',
      internalId: 'must-not-forward',
      staffNote: 'must-not-forward',
    };

    const response = await POST(
      new Request('http://localhost/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'attempt-key-123456' },
        body: JSON.stringify(booking),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example.test/api/v1/bookings',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({ 'Idempotency-Key': 'attempt-key-123456' }),
        body: JSON.stringify({
          roomTypeSlug: 'garden-double',
          checkIn: '2026-11-15',
          checkOut: '2026-11-17',
          guestCount: 2,
          roomQuantity: 1,
          guestName: 'مهمان آزمایشی',
          guestPhone: '+989123456789',
          guestEmail: 'guest@example.com',
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual(bookingResponse);
  });

  it('returns a safe gateway error when the booking API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private upstream details')));
    const response = await POST(
      new Request('http://localhost/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'attempt-key-123456' },
        body: JSON.stringify({ roomTypeSlug: 'garden-double' }),
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ code: 'SERVICE_UNAVAILABLE' });
  });
});
