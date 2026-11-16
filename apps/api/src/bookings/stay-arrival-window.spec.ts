import { parseDateOnly } from '../availability/date-range';
import { getStayArrivalWindow } from './stay-arrival-window';

describe('stay arrival window', () => {
  const hotel = { timezone: 'Asia/Tehran', checkInTime: '15:00' };
  const checkIn = parseDateOnly('2026-11-16');
  const checkOut = parseDateOnly('2026-11-18');

  it.each([
    ['2026-11-15T19:59:59Z', 'OUTSIDE_STAY'],
    ['2026-11-15T20:30:00Z', 'BEFORE_CHECK_IN_TIME'],
    ['2026-11-16T11:29:59Z', 'BEFORE_CHECK_IN_TIME'],
    ['2026-11-16T11:30:00Z', 'OPEN'],
    ['2026-11-16T20:30:00Z', 'OPEN'],
    ['2026-11-17T20:30:00Z', 'OUTSIDE_STAY'],
  ] as const)('classifies the property-local instant %s as %s', (instant, expected) => {
    expect(getStayArrivalWindow(new Date(instant), hotel, checkIn, checkOut).window).toBe(expected);
  });
});
