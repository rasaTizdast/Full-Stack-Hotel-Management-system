import { BadRequestException } from '@nestjs/common';
import { MAX_INVENTORY_RANGE_NIGHTS, parseStaffInventoryDateRange } from './date-range';

describe('parseStaffInventoryDateRange', () => {
  it('builds an inclusive-start exclusive-end range across leap day', () => {
    const range = parseStaffInventoryDateRange({
      startDate: '2028-02-28',
      endDate: '2028-03-02',
    });

    expect(range.nights.map((night) => night.dateString)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it.each([
    { startDate: '2027-02-29', endDate: '2027-03-02' },
    { startDate: '2027-03-02', endDate: '2027-03-02' },
    { startDate: '2027-03-03', endDate: '2027-03-02' },
  ])('rejects invalid or reversed dates: %o', (input) => {
    expect(() => parseStaffInventoryDateRange(input)).toThrow(BadRequestException);
  });

  it('rejects an update range longer than the supported bound', () => {
    expect(() =>
      parseStaffInventoryDateRange({ startDate: '2027-01-01', endDate: '2028-01-03' }),
    ).toThrow(BadRequestException);
    expect(MAX_INVENTORY_RANGE_NIGHTS).toBe(366);
  });
});
