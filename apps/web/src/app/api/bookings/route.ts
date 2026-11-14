import { parsePublicBookingResponse } from '@/lib/booking-client';

const BOOKING_FIELDS = [
  'roomTypeSlug',
  'checkIn',
  'checkOut',
  'guestCount',
  'roomQuantity',
  'guestName',
  'guestPhone',
  'guestEmail',
] as const;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._~-]{16,128}$/;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

function getApiBaseUrl(): string {
  return (process.env.HOTEL_API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
}

export async function POST(request: Request): Promise<Response> {
  const key = request.headers.get('Idempotency-Key') ?? '';
  if (!IDEMPOTENCY_KEY.test(key)) return json({ code: 'INVALID_IDEMPOTENCY_KEY' }, 400);

  let incoming: unknown;
  try {
    incoming = await request.json();
  } catch {
    return json({ code: 'INVALID_BOOKING_REQUEST' }, 400);
  }
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) {
    return json({ code: 'INVALID_BOOKING_REQUEST' }, 400);
  }

  const body = Object.fromEntries(
    BOOKING_FIELDS.filter((field) => Object.hasOwn(incoming, field)).map((field) => [
      field,
      (incoming as Record<string, unknown>)[field],
    ]),
  );

  try {
    const upstream = await fetch(`${getApiBaseUrl()}/bookings`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify(body),
    });
    let responseBody: unknown;
    try {
      responseBody = await upstream.json();
    } catch {
      return json({ code: 'SERVICE_UNAVAILABLE' }, 502);
    }

    if (!upstream.ok) {
      const code =
        typeof responseBody === 'object' &&
        responseBody !== null &&
        'code' in responseBody &&
        typeof responseBody.code === 'string' &&
        /^[A-Z0-9_]{1,64}$/.test(responseBody.code)
          ? responseBody.code
          : 'BOOKING_REQUEST_FAILED';
      return json({ code }, upstream.status);
    }
    const safeBooking = parsePublicBookingResponse(responseBody);
    if (!safeBooking) return json({ code: 'SERVICE_UNAVAILABLE' }, 502);
    return json(safeBooking, upstream.status);
  } catch {
    return json({ code: 'SERVICE_UNAVAILABLE' }, 502);
  }
}
