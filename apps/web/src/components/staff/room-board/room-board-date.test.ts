import { describe, expect, it } from 'vitest';
import { formatGregorianAsJalali } from '@/lib/jalali-date';
import { isDateWithinAssignmentInterval } from './room-board-date';

describe('isDateWithinAssignmentInterval', () => {
  it('includes the assignment start date', () => {
    expect(isDateWithinAssignmentInterval('2026-11-17', '2026-11-20', '2026-11-17')).toBe(true);
  });

  it('excludes the assignment end date', () => {
    expect(isDateWithinAssignmentInterval('2026-11-17', '2026-11-20', '2026-11-20')).toBe(false);
  });

  it('accepts Jalali editor dates alongside the Gregorian board date', () => {
    const startDate = formatGregorianAsJalali('2026-11-17');
    const endDate = formatGregorianAsJalali('2026-11-20');

    expect(startDate).not.toBeNull();
    expect(endDate).not.toBeNull();
    expect(isDateWithinAssignmentInterval(startDate!, endDate!, '2026-11-19')).toBe(true);
  });
});
