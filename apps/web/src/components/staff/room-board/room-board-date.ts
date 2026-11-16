import { toGregorianIso } from '@/lib/jalali-date';

function normalizeDate(value: string): string | null {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toGregorianIso(value);
  if (!isoDate) return null;

  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === isoDate
    ? isoDate
    : null;
}

export function isDateWithinAssignmentInterval(
  startInput: string,
  endInput: string,
  dateInput: string,
): boolean {
  const startDate = normalizeDate(startInput);
  const endDate = normalizeDate(endInput);
  const date = normalizeDate(dateInput);
  return Boolean(startDate && endDate && date && startDate <= date && date < endDate);
}
