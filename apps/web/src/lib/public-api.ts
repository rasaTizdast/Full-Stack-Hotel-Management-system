import { cache } from 'react';
import { isAvailabilityResult, type AvailabilityResult } from './availability';

export type PublicHotel = {
  slug: string;
  name: string;
  address: string;
  description: string;
  timezone: string;
  contactPhone: string | null;
  contactEmail: string | null;
};

export type PublicRoomType = {
  slug: string;
  name: string;
  description: string;
  maxGuestsPerRoom: number;
  amenities: string[];
};

export type PublicApiErrorKind = 'not-found' | 'unavailable' | 'invalid-response';

export class PublicApiError extends Error {
  constructor(readonly kind: PublicApiErrorKind) {
    const messageByKind: Record<PublicApiErrorKind, string> = {
      'not-found': 'The requested public content was not found.',
      unavailable: 'Public hotel information is temporarily unavailable.',
      'invalid-response': 'The public hotel service returned invalid information.',
    };
    super(messageByKind[kind]);
    this.name = 'PublicApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isPublicHotel(value: unknown): value is PublicHotel {
  return (
    isRecord(value) &&
    typeof value.slug === 'string' &&
    typeof value.name === 'string' &&
    typeof value.address === 'string' &&
    typeof value.description === 'string' &&
    typeof value.timezone === 'string' &&
    isOptionalString(value.contactPhone) &&
    isOptionalString(value.contactEmail)
  );
}

function isPublicRoomType(value: unknown): value is PublicRoomType {
  return (
    isRecord(value) &&
    typeof value.slug === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    Number.isSafeInteger(value.maxGuestsPerRoom) &&
    Number(value.maxGuestsPerRoom) > 0 &&
    Array.isArray(value.amenities) &&
    value.amenities.every((amenity) => typeof amenity === 'string')
  );
}

function getApiBaseUrl(): string {
  return (process.env.HOTEL_API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
}

async function requestPublicJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new PublicApiError('unavailable');
  }

  if (response.status === 404) {
    throw new PublicApiError('not-found');
  }
  if (!response.ok) {
    throw new PublicApiError('unavailable');
  }

  try {
    return await response.json();
  } catch {
    throw new PublicApiError('invalid-response');
  }
}

async function loadPublicHotel(): Promise<PublicHotel> {
  const value = await requestPublicJson('/hotel');
  if (!isPublicHotel(value)) {
    throw new PublicApiError('invalid-response');
  }

  return {
    slug: value.slug,
    name: value.name,
    address: value.address,
    description: value.description,
    timezone: value.timezone,
    contactPhone: value.contactPhone,
    contactEmail: value.contactEmail,
  };
}

async function loadPublicRoomTypes(): Promise<PublicRoomType[]> {
  const value = await requestPublicJson('/room-types');
  if (!Array.isArray(value) || !value.every(isPublicRoomType)) {
    throw new PublicApiError('invalid-response');
  }

  return value.map((room) => ({
    slug: room.slug,
    name: room.name,
    description: room.description,
    maxGuestsPerRoom: room.maxGuestsPerRoom,
    amenities: [...room.amenities],
  }));
}

export const getPublicHotel = cache(loadPublicHotel);
export const getPublicRoomTypes = cache(loadPublicRoomTypes);

export async function getPublicAvailability(query: {
  checkIn: string;
  checkOut: string;
  guests: number;
}): Promise<AvailabilityResult> {
  const params = new URLSearchParams({
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    guests: String(query.guests),
  });
  const value = await requestPublicJson(`/availability?${params.toString()}`);
  if (!isAvailabilityResult(value)) throw new PublicApiError('invalid-response');
  return value;
}
