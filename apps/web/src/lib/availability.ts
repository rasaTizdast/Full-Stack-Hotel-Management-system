import type { AvailabilitySearchQuery } from './jalali-date';

export type AvailabilityNight = {
  stayDate: string;
  isAvailable: boolean;
  availableRooms: number;
  nightlyPriceToman: string | null;
};

export type AvailabilityRoomType = {
  slug: string;
  name: string;
  maxGuestsPerRoom: number;
  isAvailable: boolean;
  availableRooms: number;
  totalPriceToman: string | null;
  nightlyBreakdown: AvailabilityNight[];
};

export type AvailabilityResult = {
  checkIn: string;
  checkOut: string;
  guests: number;
  numberOfNights: number;
  roomTypes: AvailabilityRoomType[];
};

export type AvailabilityResultsState = 'empty' | 'unavailable' | 'available';
export type AvailabilityApiErrorKind = 'unavailable' | 'server-error';

export class AvailabilityApiError extends Error {
  constructor(readonly kind: AvailabilityApiErrorKind) {
    super(
      kind === 'unavailable'
        ? 'The selected stay is no longer available.'
        : 'Availability could not be loaded.',
    );
    this.name = 'AvailabilityApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTomanAmount(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value));
}

function isAvailabilityNight(value: unknown): value is AvailabilityNight {
  return (
    isRecord(value) &&
    typeof value.stayDate === 'string' &&
    typeof value.isAvailable === 'boolean' &&
    Number.isSafeInteger(value.availableRooms) &&
    Number(value.availableRooms) >= 0 &&
    isTomanAmount(value.nightlyPriceToman)
  );
}

function isAvailabilityRoomType(value: unknown): value is AvailabilityRoomType {
  return (
    isRecord(value) &&
    typeof value.slug === 'string' &&
    typeof value.name === 'string' &&
    Number.isSafeInteger(value.maxGuestsPerRoom) &&
    Number(value.maxGuestsPerRoom) > 0 &&
    typeof value.isAvailable === 'boolean' &&
    Number.isSafeInteger(value.availableRooms) &&
    Number(value.availableRooms) >= 0 &&
    isTomanAmount(value.totalPriceToman) &&
    Array.isArray(value.nightlyBreakdown) &&
    value.nightlyBreakdown.every(isAvailabilityNight)
  );
}

function isAvailabilityResult(value: unknown): value is AvailabilityResult {
  return (
    isRecord(value) &&
    typeof value.checkIn === 'string' &&
    typeof value.checkOut === 'string' &&
    Number.isSafeInteger(value.guests) &&
    Number(value.guests) > 0 &&
    Number.isSafeInteger(value.numberOfNights) &&
    Number(value.numberOfNights) > 0 &&
    Array.isArray(value.roomTypes) &&
    value.roomTypes.every(isAvailabilityRoomType)
  );
}

export function classifyAvailabilityResults(
  roomTypes: readonly Pick<AvailabilityRoomType, 'isAvailable'>[],
): AvailabilityResultsState {
  if (roomTypes.length === 0) return 'empty';
  return roomTypes.some((roomType) => roomType.isAvailable) ? 'available' : 'unavailable';
}

export function formatTomanTotal(amount: string): string {
  if (!/^(0|[1-9]\d*)$/.test(amount)) {
    throw new TypeError('Toman totals must be non-negative integer strings.');
  }
  return new Intl.NumberFormat('fa-IR').format(BigInt(amount));
}

export async function fetchAvailability(
  query: AvailabilitySearchQuery,
): Promise<AvailabilityResult> {
  const params = new URLSearchParams({
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    guests: String(query.guests),
  });
  let response: Response;
  try {
    response = await fetch(`/api/availability?${params.toString()}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new AvailabilityApiError('server-error');
  }

  if (response.status === 400 || response.status === 409) {
    throw new AvailabilityApiError('unavailable');
  }
  if (!response.ok) throw new AvailabilityApiError('server-error');

  try {
    const value: unknown = await response.json();
    if (!isAvailabilityResult(value)) throw new AvailabilityApiError('server-error');
    return value;
  } catch (error) {
    if (error instanceof AvailabilityApiError) throw error;
    throw new AvailabilityApiError('server-error');
  }
}
