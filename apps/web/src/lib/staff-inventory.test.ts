import { describe, expect, it } from 'vitest';
import {
  getDefaultInventoryRangeInput,
  normalizeInventoryNumericInput,
  parseInventoryCapacityInput,
  parseInventoryPriceInput,
  validateInventoryRangeInput,
} from './staff-inventory';

describe('staff inventory input helpers', () => {
  it('defaults to the next seven hotel nights in Jalali dates', () => {
    expect(getDefaultInventoryRangeInput(new Date('2024-03-18T12:00:00.000Z'))).toEqual({
      startDate: '۱۴۰۲/۱۲/۲۹',
      endDate: '۱۴۰۳/۰۱/۰۷',
    });
  });

  it('converts valid Jalali ranges to Gregorian dates with an exclusive end date', () => {
    expect(validateInventoryRangeInput({ startDate: '۱۴۰۲/۱۲/۲۹', endDate: '۱۴۰۳/۰۱/۰۵' })).toEqual(
      {
        errors: {},
        range: { startDate: '2024-03-19', endDate: '2024-03-24', numberOfNights: 5 },
      },
    );
  });

  it('attaches invalid, reversed, and overlong ranges to the relevant field', () => {
    expect(
      validateInventoryRangeInput({ startDate: '۱۴۰۲/۱۲/۳۰', endDate: '۱۴۰۳/۰۱/۰۵' }).errors,
    ).toHaveProperty('startDate');
    expect(
      validateInventoryRangeInput({ startDate: '۱۴۰۳/۰۱/۰۵', endDate: '۱۴۰۳/۰۱/۰۱' }).errors,
    ).toHaveProperty('endDate');
    expect(
      validateInventoryRangeInput({ startDate: '۱۴۰۳/۰۱/۰۱', endDate: '۱۴۰۴/۰۱/۰۳' }).errors,
    ).toHaveProperty('endDate');
  });

  it('normalizes Persian digits and grouping separators for integer inputs', () => {
    expect(normalizeInventoryNumericInput(' ۳٬۵۰۰٬۰۰۰ ')).toBe('3500000');
    expect(parseInventoryCapacityInput('۱۲')).toBe(12);
    expect(parseInventoryPriceInput('۳٬۵۰۰٬۰۰۰')).toBe('3500000');
  });

  it('rejects negative, fractional, and values outside API integer bounds', () => {
    expect(parseInventoryCapacityInput('-1')).toBeNull();
    expect(parseInventoryCapacityInput('1.5')).toBeNull();
    expect(parseInventoryCapacityInput('2147483648')).toBeNull();
    expect(parseInventoryPriceInput('-1')).toBeNull();
    expect(parseInventoryPriceInput('9223372036854775808')).toBeNull();
  });
});
