import { BadRequestException } from '@nestjs/common';

export const MAX_INVENTORY_RANGE_NIGHTS = 366;
const MILLISECONDS_PER_DAY = 86_400_000;

export interface StaffInventoryDateRangeInput {
  startDate: string;
  endDate: string;
}

export interface StaffInventoryDateRange {
  startDate: string;
  endDate: string;
  start: Date;
  end: Date;
  nights: Array<{ date: Date; dateString: string }>;
}

function invalidField(field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed.',
    fields: [{ field, messages: [message] }],
  });
}

function parseDateOnly(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalidField(field, 'Use a valid Gregorian YYYY-MM-DD date.');
  }

  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw invalidField(field, 'Use a valid Gregorian YYYY-MM-DD date.');
  }

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw invalidField(field, 'Use a valid Gregorian YYYY-MM-DD date.');
  }

  return date;
}

export function parseStaffInventoryDateRange(
  input: StaffInventoryDateRangeInput,
): StaffInventoryDateRange {
  const start = parseDateOnly(input.startDate, 'startDate');
  const end = parseDateOnly(input.endDate, 'endDate');
  const numberOfNights = (end.getTime() - start.getTime()) / MILLISECONDS_PER_DAY;

  if (numberOfNights < 1) {
    throw invalidField('endDate', 'End date must be after start date.');
  }
  if (numberOfNights > MAX_INVENTORY_RANGE_NIGHTS) {
    throw invalidField('endDate', `Date range cannot exceed ${MAX_INVENTORY_RANGE_NIGHTS} nights.`);
  }

  const nights = Array.from({ length: numberOfNights }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return { date, dateString: date.toISOString().slice(0, 10) };
  });

  return { startDate: input.startDate, endDate: input.endDate, start, end, nights };
}
