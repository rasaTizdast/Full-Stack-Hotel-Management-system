import { isValidJalaaliDate, toGregorian, toJalaali } from 'jalaali-js';

const persianDigits = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const persianIntegerFormatter = new Intl.NumberFormat('fa-IR');

export type AvailabilitySearchInput = {
  checkIn: string;
  checkOut: string;
  guests: string;
};

export type AvailabilitySearchQuery = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

export type AvailabilitySearchErrors = Partial<Record<keyof AvailabilitySearchInput, string>>;

export type AvailabilitySearchValidation = {
  errors: AvailabilitySearchErrors;
  query?: AvailabilitySearchQuery;
};

export function normalizeDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) =>
    String(
      digit.charCodeAt(0) >= 0x06f0 ? digit.charCodeAt(0) - 0x06f0 : digit.charCodeAt(0) - 0x0660,
    ),
  );
}

export function toGregorianIso(jalaliInput: string): string | null {
  const normalized = normalizeDigits(jalaliInput.trim());
  const dateInput = /^\d{8}$/.test(normalized)
    ? `${normalized.slice(0, 4)}/${normalized.slice(4, 6)}/${normalized.slice(6, 8)}`
    : normalized;
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(dateInput);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  try {
    if (!isValidJalaaliDate(year, month, day)) return null;
    const gregorian = toGregorian(year, month, day);
    return `${String(gregorian.gy).padStart(4, '0')}-${String(gregorian.gm).padStart(2, '0')}-${String(gregorian.gd).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

export function formatGregorianAsJalali(gregorianIso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gregorianIso);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const jalali = toJalaali(year, month, day);
  return `${persianDigits.format(jalali.jy).padStart(4, '۰')}/${persianDigits.format(jalali.jm).padStart(2, '۰')}/${persianDigits.format(jalali.jd).padStart(2, '۰')}`;
}

export function getHotelTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getDefaultStayInput(
  now: Date = new Date(),
): Pick<AvailabilitySearchInput, 'checkIn' | 'checkOut'> {
  const today = getHotelTodayIso(now);
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const checkIn = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 2);
  const checkOut = date.toISOString().slice(0, 10);
  return {
    checkIn: formatGregorianAsJalali(checkIn) ?? '',
    checkOut: formatGregorianAsJalali(checkOut) ?? '',
  };
}

export function validateAvailabilitySearch(
  input: AvailabilitySearchInput,
  todayIso: string = getHotelTodayIso(),
): AvailabilitySearchValidation {
  const errors: AvailabilitySearchErrors = {};
  const checkIn = toGregorianIso(input.checkIn);
  const checkOut = toGregorianIso(input.checkOut);
  const guestText = normalizeDigits(input.guests.trim());
  const guestCount = /^\d+$/.test(guestText) ? Number(guestText) : Number.NaN;

  if (!input.checkIn.trim()) {
    errors.checkIn = 'تاریخ ورود را وارد کنید.';
  } else if (!checkIn) {
    errors.checkIn = 'تاریخ ورود را به شکل سال/ماه/روز معتبر وارد کنید.';
  } else if (checkIn < todayIso) {
    errors.checkIn = 'تاریخ ورود نمی‌تواند در گذشته باشد.';
  }

  if (!input.checkOut.trim()) {
    errors.checkOut = 'تاریخ خروج را وارد کنید.';
  } else if (!checkOut) {
    errors.checkOut = 'تاریخ خروج را به شکل سال/ماه/روز معتبر وارد کنید.';
  } else if (checkIn && checkOut <= checkIn) {
    errors.checkOut = 'تاریخ خروج باید پس از تاریخ ورود باشد.';
  } else if (
    checkIn &&
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000 > 30
  ) {
    errors.checkOut = 'مدت اقامت نمی‌تواند بیشتر از ۳۰ شب باشد.';
  }

  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
    errors.guests = 'تعداد مهمان باید عددی بین ۱ تا ۲۰ باشد.';
  }

  if (Object.keys(errors).length > 0 || !checkIn || !checkOut) return { errors };
  return { errors, query: { checkIn, checkOut, guests: guestCount } };
}

export function formatPersianInteger(value: number | bigint): string {
  return persianIntegerFormatter.format(value);
}
