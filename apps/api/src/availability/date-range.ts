import { BadRequestException } from '@nestjs/common';

export const MAX_STAY_NIGHTS = 30;
export const MIN_GUESTS = 1;
export const MAX_GUESTS = 20;
export const HOTEL_TIME_ZONE = 'Asia/Tehran';

export interface AvailabilityCriteriaInput {
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface AvailabilityCriteria {
  checkIn: string;
  checkOut: string;
  checkInDate: Date;
  checkOutDate: Date;
  guests: number;
  numberOfNights: number;
  stayDates: Date[];
  stayDateStrings: string[];
}

const DOMAIN_ERROR_MESSAGES: Record<string, string> = {
  INVALID_DATE_RANGE: 'Use valid Gregorian YYYY-MM-DD dates and checkout after check-in.',
  CHECK_IN_IN_PAST: 'Check-in date must be today or later.',
  STAY_TOO_LONG: 'Stay cannot exceed 30 nights.',
  INVALID_GUEST_COUNT: 'Guest count must be an integer from 1 to 20.',
};

function badRequest(code: keyof typeof DOMAIN_ERROR_MESSAGES): BadRequestException {
  return new BadRequestException({ code, message: DOMAIN_ERROR_MESSAGES[code] });
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest('INVALID_DATE_RANGE');
  }

  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw badRequest('INVALID_DATE_RANGE');
  }

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw badRequest('INVALID_DATE_RANGE');
  }

  return date;
}

export function getHotelBusinessDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOTEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(dateOnly: string, days: number): string {
  const date = parseDateOnly(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function parseAvailabilityCriteria(
  input: AvailabilityCriteriaInput,
  today: string = getHotelBusinessDate(),
): AvailabilityCriteria {
  if (!Number.isInteger(input.guests) || input.guests < MIN_GUESTS || input.guests > MAX_GUESTS) {
    throw badRequest('INVALID_GUEST_COUNT');
  }

  const checkInDate = parseDateOnly(input.checkIn);
  const checkOutDate = parseDateOnly(input.checkOut);
  const todayDate = parseDateOnly(today);
  if (checkOutDate.getTime() <= checkInDate.getTime()) {
    throw badRequest('INVALID_DATE_RANGE');
  }
  if (checkInDate.getTime() < todayDate.getTime()) {
    throw badRequest('CHECK_IN_IN_PAST');
  }

  const numberOfNights = (checkOutDate.getTime() - checkInDate.getTime()) / 86_400_000;
  if (numberOfNights > MAX_STAY_NIGHTS) {
    throw badRequest('STAY_TOO_LONG');
  }

  const stayDates = Array.from({ length: numberOfNights }, (_, index) => {
    const date = new Date(checkInDate);
    date.setUTCDate(date.getUTCDate() + index);
    return date;
  });

  return {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    checkInDate,
    checkOutDate,
    guests: input.guests,
    numberOfNights,
    stayDates,
    stayDateStrings: stayDates.map((date) => date.toISOString().slice(0, 10)),
  };
}
