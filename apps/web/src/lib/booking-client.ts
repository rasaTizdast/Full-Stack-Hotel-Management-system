import { z } from 'zod';

export type BookingCreatePayload = {
  roomTypeSlug: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomQuantity: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
};

const money = z.string().regex(/^(0|[1-9]\d*)$/);
const bookingResponseSchema = z.object({
  reference: z.string().min(1).max(80),
  status: z.literal('PENDING_CONFIRMATION'),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.number().int().positive(),
  roomQuantity: z.number().int().positive(),
  roomType: z.object({ slug: z.string().min(1), name: z.string().min(1) }).strict(),
  priceSummary: z
    .object({
      numberOfNights: z.number().int().positive(),
      totalPriceToman: money,
      nights: z.array(
        z
          .object({
            stayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            nightlyPriceToman: money,
            roomQuantity: z.number().int().positive(),
            amountToman: money,
          })
          .strict(),
      ),
    })
    .strict(),
});

export type PublicBookingResponse = z.infer<typeof bookingResponseSchema>;
export type BookingApiErrorKind = 'availability-changed' | 'server-error';

export function parsePublicBookingResponse(value: unknown): PublicBookingResponse | null {
  const parsed = bookingResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class BookingApiError extends Error {
  constructor(readonly kind: BookingApiErrorKind) {
    super(
      kind === 'availability-changed'
        ? 'The selected inventory changed.'
        : 'Booking could not be submitted.',
    );
    this.name = 'BookingApiError';
  }
}

export async function submitBookingRequest(
  payload: BookingCreatePayload,
  idempotencyKey: string,
): Promise<PublicBookingResponse> {
  let response: Response;
  try {
    response = await fetch('/api/bookings', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new BookingApiError('server-error');
  }

  if (!response.ok) {
    let code = '';
    try {
      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        'code' in body &&
        typeof body.code === 'string'
      ) {
        code = body.code;
      }
    } catch {
      // The error status is enough to return a safe, generic message.
    }
    if (response.status === 409 && ['AVAILABILITY_CHANGED', 'ROOM_TYPE_NOT_FOUND'].includes(code)) {
      throw new BookingApiError('availability-changed');
    }
    throw new BookingApiError('server-error');
  }

  try {
    const body: unknown = await response.json();
    const booking = parsePublicBookingResponse(body);
    if (!booking) throw new BookingApiError('server-error');
    return booking;
  } catch (error) {
    if (error instanceof BookingApiError) throw error;
    throw new BookingApiError('server-error');
  }
}
