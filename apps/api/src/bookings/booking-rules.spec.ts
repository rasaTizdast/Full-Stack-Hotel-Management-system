import { BadRequestException } from '@nestjs/common';
import {
  assertGuestCapacity,
  calculateBookingTotal,
  hashBookingRequest,
  normalizeIranianMobileNumber,
} from './booking-rules';

describe('booking request rules', () => {
  it.each([
    ['national format with spaces', '0912 123 4567'],
    ['country code format', '0098 912 123 4567'],
    ['international format', '+989121234567'],
    ['Persian digits', '۰۹۱۲۱۲۳۴۵۶۷'],
    ['Arabic digits', '٠٩١٢١٢٣٤٥٦٧'],
  ])('normalizes %s to one Iranian mobile format', (_format, input) => {
    expect(normalizeIranianMobileNumber(input)).toBe('+989121234567');
  });

  it('returns no normalized number for a non-mobile phone', () => {
    expect(normalizeIranianMobileNumber('021 1234 5678')).toBe('');
  });

  it('calculates total Toman from stored nightly prices and room quantity', () => {
    expect(calculateBookingTotal([1_200_000n, 2_300_000n], 2)).toBe(7_000_000n);
  });

  it('rejects a guest count above the total capacity of the selected room quantity', () => {
    expect(() => assertGuestCapacity(5, 2, 2)).toThrow(BadRequestException);
    expect(() => assertGuestCapacity(4, 2, 2)).not.toThrow();
  });

  it('treats alternate formatting of one mobile as an equivalent idempotent request', () => {
    const common = {
      roomTypeSlug: 'garden-suite',
      checkIn: '2026-12-01',
      checkOut: '2026-12-03',
      guestCount: 2,
      roomQuantity: 1,
      guestName: 'Fictional Guest',
      guestEmail: 'GUEST@example.invalid',
    };

    expect(hashBookingRequest({ ...common, guestPhone: '0912 123 4567' })).toBe(
      hashBookingRequest({
        ...common,
        guestPhone: '+989121234567',
        guestEmail: 'guest@example.invalid',
      }),
    );
    expect(
      hashBookingRequest({ ...common, guestPhone: '0912 123 4567', guestName: 'Other Guest' }),
    ).not.toBe(hashBookingRequest({ ...common, guestPhone: '0912 123 4567' }));
  });
});
