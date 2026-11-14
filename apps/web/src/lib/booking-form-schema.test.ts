import { describe, expect, it } from 'vitest';
import { createBookingFormSchema, normalizeIranianMobileNumber } from './booking-form-schema';

describe('Iranian mobile normalization', () => {
  it.each([
    ['۰۹۱۲ ۳۴۵ ۶۷۸۹', '+989123456789'],
    ['0912-345-6789', '+989123456789'],
    ['+98 (912) 345-6789', '+989123456789'],
    ['00989123456789', '+989123456789'],
    ['٩١٢٣٤٥٦٧٨٩', '+989123456789'],
  ])('normalizes %s to the API format', (input, expected) => {
    expect(normalizeIranianMobileNumber(input)).toBe(expected);
  });

  it('rejects landlines, short values, and non-numeric characters', () => {
    expect(normalizeIranianMobileNumber('02188776655')).toBe('');
    expect(normalizeIranianMobileNumber('091234')).toBe('');
    expect(normalizeIranianMobileNumber('0912-abc-6789')).toBe('');
  });
});

describe('booking form schema', () => {
  const schema = createBookingFormSchema({
    guestCount: 3,
    maxGuestsPerRoom: 2,
    availableRooms: 3,
  });

  it('trims contact details, normalizes the phone, and accepts the minimum room quantity for capacity', () => {
    expect(
      schema.parse({
        roomQuantity: '2',
        guestName: '  مریم رضایی  ',
        guestPhone: '۰۹۱۲۳۴۵۶۷۸۹',
        guestEmail: '  MARYAM@example.com  ',
      }),
    ).toEqual({
      roomQuantity: 2,
      guestName: 'مریم رضایی',
      guestPhone: '+989123456789',
      guestEmail: 'maryam@example.com',
    });
  });

  it('allows an empty optional email and rejects a room quantity that cannot fit the guests', () => {
    expect(
      schema.parse({
        roomQuantity: '2',
        guestName: 'مریم',
        guestPhone: '09123456789',
        guestEmail: '',
      }).guestEmail,
    ).toBeUndefined();
    expect(
      schema.safeParse({
        roomQuantity: '1',
        guestName: 'مریم',
        guestPhone: '09123456789',
        guestEmail: '',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid names, Iranian mobile numbers, email, and room quantities above availability', () => {
    const invalid = schema.safeParse({
      roomQuantity: '4',
      guestName: ' ',
      guestPhone: '02188776655',
      guestEmail: 'not-an-email',
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(['roomQuantity', 'guestName', 'guestPhone', 'guestEmail']),
      );
    }
  });
});
