import { describe, expect, it } from 'vitest';
import { getStaffHomePath } from './staff-navigation';

describe('getStaffHomePath', () => {
  it('takes a housekeeper directly to their housekeeping workspace', () => {
    expect(getStaffHomePath('HOUSEKEEPER')).toBe('/staff/housekeeping');
  });

  it('keeps cashiers on the general staff overview', () => {
    expect(getStaffHomePath('CASHIER')).toBe('/staff');
  });
});
