import {
  formatGregorianAsJalali,
  getHotelTodayIso,
  normalizeDigits,
  toGregorianIso,
} from './jalali-date';

export type InventoryRangeInput = {
  startDate: string;
  endDate: string;
};

export type InventoryRangeErrors = Partial<Record<keyof InventoryRangeInput, string>>;

export type InventoryDateRange = {
  startDate: string;
  endDate: string;
  numberOfNights: number;
};

export type InventoryRangeValidation = {
  errors: InventoryRangeErrors;
  range?: InventoryDateRange;
};

const MAX_INVENTORY_RANGE_NIGHTS = 366;
const MAX_ROOMS = 2_147_483_647;
const MAX_TOMAN_AMOUNT = BigInt('9223372036854775807');

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getDefaultInventoryRangeInput(now: Date = new Date()): InventoryRangeInput {
  const startDate = addDays(getHotelTodayIso(now), 1);
  const endDate = addDays(startDate, 7);
  return {
    startDate: formatGregorianAsJalali(startDate) ?? '',
    endDate: formatGregorianAsJalali(endDate) ?? '',
  };
}

export function validateInventoryRangeInput(input: InventoryRangeInput): InventoryRangeValidation {
  const errors: InventoryRangeErrors = {};
  const startDate = toGregorianIso(input.startDate);
  const endDate = toGregorianIso(input.endDate);

  if (!input.startDate.trim()) {
    errors.startDate = 'تاریخ شروع را وارد کنید.';
  } else if (!startDate) {
    errors.startDate = 'تاریخ شروع را به شکل سال/ماه/روز شمسی معتبر وارد کنید.';
  }

  if (!input.endDate.trim()) {
    errors.endDate = 'تاریخ پایان را وارد کنید.';
  } else if (!endDate) {
    errors.endDate = 'تاریخ پایان را به شکل سال/ماه/روز شمسی معتبر وارد کنید.';
  }

  if (startDate && endDate) {
    const numberOfNights =
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
      86_400_000;
    if (numberOfNights <= 0) {
      errors.endDate = 'تاریخ پایان باید پس از تاریخ شروع باشد.';
    } else if (numberOfNights > MAX_INVENTORY_RANGE_NIGHTS) {
      errors.endDate = `بازه نمی‌تواند بیشتر از ${MAX_INVENTORY_RANGE_NIGHTS} شب باشد.`;
    } else if (Object.keys(errors).length === 0) {
      return { errors, range: { startDate, endDate, numberOfNights } };
    }
  }

  return { errors };
}

export function normalizeInventoryNumericInput(value: string): string {
  return normalizeDigits(value).replace(/[\s,٬]/g, '');
}

export function parseInventoryCapacityInput(value: string): number | null {
  const normalized = normalizeInventoryNumericInput(value);
  if (!/^\d+$/.test(normalized)) return null;
  const capacity = Number(normalized);
  return Number.isSafeInteger(capacity) && capacity >= 0 && capacity <= MAX_ROOMS ? capacity : null;
}

export function parseInventoryPriceInput(value: string): string | null {
  const normalized = normalizeInventoryNumericInput(value);
  if (!/^\d+$/.test(normalized)) return null;
  const amount = BigInt(normalized);
  return amount <= MAX_TOMAN_AMOUNT ? amount.toString() : null;
}
