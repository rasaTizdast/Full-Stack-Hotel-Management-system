import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingApiError, submitBookingRequest, type BookingCreatePayload } from './booking-client';

const payload: BookingCreatePayload = {
  roomTypeSlug: 'garden-double',
  checkIn: '2026-11-15',
  checkOut: '2026-11-17',
  guestCount: 2,
  roomQuantity: 1,
  guestName: 'مهمان آزمایشی',
  guestPhone: '+989123456789',
  guestEmail: 'guest@example.com',
};

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

afterEach(() => vi.unstubAllGlobals());

describe('booking API client', () => {
  it('sends the request once with the stable idempotency key and no cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(bookingResponse, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitBookingRequest(payload, 'stable-attempt-key-123')).resolves.toEqual(
      bookingResponse,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({ 'Idempotency-Key': 'stable-attempt-key-123' }),
        body: JSON.stringify(payload),
      }),
    );
  });

  it('maps an availability conflict to a recoverable guest state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ code: 'AVAILABILITY_CHANGED' }, { status: 409 })),
    );
    await expect(submitBookingRequest(payload, 'stable-attempt-key-123')).rejects.toMatchObject<
      Partial<BookingApiError>
    >({ kind: 'availability-changed' });
  });

  it('does not treat server or malformed responses as a booking confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(submitBookingRequest(payload, 'stable-attempt-key-123')).rejects.toMatchObject<
      Partial<BookingApiError>
    >({ kind: 'server-error' });

    fetchMock.mockResolvedValueOnce(Response.json({ reference: 'not-a-confirmation' }));
    await expect(submitBookingRequest(payload, 'stable-attempt-key-123')).rejects.toMatchObject<
      Partial<BookingApiError>
    >({ kind: 'server-error' });
  });
});
