import { describe, expect, it } from 'vitest';
import { formatGregorianAsJalali, toGregorianIso, validateAvailabilitySearch } from './jalali-date';

describe('Jalali date conversion', () => {
  it('converts dates across the Jalali month and year boundary', () => {
    expect(toGregorianIso('۱۴۰۲/۱۲/۲۹')).toBe('2024-03-19');
    expect(toGregorianIso('1403/01/01')).toBe('2024-03-20');
  });

  it('accepts the last day of a leap year and rejects day 30 in a common year', () => {
    expect(toGregorianIso('۱۳۹۹/۱۲/۳۰')).toBe('2021-03-20');
    expect(toGregorianIso('۱۴۰۰/۱۲/۳۰')).toBeNull();
    expect(toGregorianIso('۱۴۰۲/۱۲/۳۰')).toBeNull();
  });

  it('formats Gregorian dates for Persian users and rejects malformed Gregorian dates', () => {
    expect(formatGregorianAsJalali('2024-03-20')).toBe('۱۴۰۳/۰۱/۰۱');
    expect(formatGregorianAsJalali('2024-02-30')).toBeNull();
  });
});

describe('availability search validation', () => {
  const today = '2024-03-19';

  it('accepts a valid stay crossing a Jalali year boundary', () => {
    expect(
      validateAvailabilitySearch(
        { checkIn: '۱۴۰۲/۱۲/۲۹', checkOut: '۱۴۰۳/۰۱/۰۱', guests: '۲' },
        today,
      ),
    ).toEqual({ errors: {}, query: { checkIn: '2024-03-19', checkOut: '2024-03-20', guests: 2 } });
  });

  it('rejects past dates, checkout on or before check-in, long stays, and invalid guests', () => {
    expect(
      validateAvailabilitySearch(
        { checkIn: '1402/12/28', checkOut: '1402/12/29', guests: '2' },
        today,
      ).errors.checkIn,
    ).toBeTruthy();
    expect(
      validateAvailabilitySearch(
        { checkIn: '1403/01/01', checkOut: '1403/01/01', guests: '2' },
        today,
      ).errors.checkOut,
    ).toBeTruthy();
    expect(
      validateAvailabilitySearch(
        { checkIn: '1403/01/01', checkOut: '1403/02/01', guests: '2' },
        today,
      ).errors.checkOut,
    ).toBeTruthy();
    expect(
      validateAvailabilitySearch(
        { checkIn: '1403/01/01', checkOut: '1403/01/02', guests: '21' },
        today,
      ).errors.guests,
    ).toBeTruthy();
  });
});
