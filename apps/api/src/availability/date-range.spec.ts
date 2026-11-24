import { BadRequestException } from '@nestjs/common';
import { getHotelBusinessDate, parseAvailabilityCriteria } from './date-range';

describe('availability date range', () => {
  it('uses the hotel business timezone when deriving today', () => {
    expect(getHotelBusinessDate(new Date('2026-03-09T20:30:00.000Z'))).toBe('2026-03-10');
  });

  it('changes the Tehran date at local midnight rather than UTC midnight', () => {
    expect(getHotelBusinessDate(new Date('2026-03-09T20:29:59.999Z'))).toBe('2026-03-09');
    expect(getHotelBusinessDate(new Date('2026-03-09T20:30:00.000Z'))).toBe('2026-03-10');
  });

  it('treats checkout as exclusive and builds Gregorian stay dates', () => {
    const criteria = parseAvailabilityCriteria(
      { checkIn: '2026-03-10', checkOut: '2026-03-12', guests: 2 },
      '2026-03-09',
    );

    expect(criteria.numberOfNights).toBe(2);
    expect(criteria.stayDates.map((date) => date.toISOString().slice(0, 10))).toEqual([
      '2026-03-10',
      '2026-03-11',
    ]);
    expect(criteria.checkOutDate.toISOString().slice(0, 10)).toBe('2026-03-12');
  });

  it('accepts the documented 30-night maximum', () => {
    const criteria = parseAvailabilityCriteria(
      { checkIn: '2026-03-10', checkOut: '2026-04-09', guests: 2 },
      '2026-03-09',
    );

    expect(criteria.numberOfNights).toBe(30);
    expect(criteria.stayDates).toHaveLength(30);
  });

  it.each([
    ['non-padded date strings', '2026-3-10', '2026-03-12', 'INVALID_DATE_RANGE'],
    ['impossible Gregorian dates', '2026-02-30', '2026-03-02', 'INVALID_DATE_RANGE'],
    ['checkout equal to check-in', '2026-03-10', '2026-03-10', 'INVALID_DATE_RANGE'],
    ['checkout before check-in', '2026-03-11', '2026-03-10', 'INVALID_DATE_RANGE'],
    ['past check-in dates', '2026-03-08', '2026-03-10', 'CHECK_IN_IN_PAST'],
    ['stays longer than 30 nights', '2026-03-10', '2026-04-10', 'STAY_TOO_LONG'],
  ])('rejects %s with a stable business error', (_label, checkIn, checkOut, code) => {
    try {
      parseAvailabilityCriteria({ checkIn, checkOut, guests: 2 }, '2026-03-09');
      throw new Error('Expected the date range to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ code });
    }
  });

  it.each([0, -1, 1.5, 21])('rejects guest count %s outside 1..20', (guests) => {
    try {
      parseAvailabilityCriteria(
        { checkIn: '2026-03-10', checkOut: '2026-03-12', guests },
        '2026-03-09',
      );
      throw new Error('Expected the guest count to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_GUEST_COUNT',
      });
    }
  });
});
