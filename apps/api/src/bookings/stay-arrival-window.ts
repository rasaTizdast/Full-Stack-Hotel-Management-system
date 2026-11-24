import { hotelBusinessDate } from '../rooms/room-capacity.service';

type ArrivalWindow = 'OUTSIDE_STAY' | 'BEFORE_CHECK_IN_TIME' | 'OPEN';

export function getStayArrivalWindow(
  now: Date,
  hotel: { timezone: string; checkInTime: string; businessDate?: Date },
  checkIn: Date,
  checkOut: Date,
): { businessDate: Date; window: ArrivalWindow } {
  const businessDate = hotel.businessDate ?? hotelBusinessDate(hotel.timezone, now);
  if (businessDate < checkIn || businessDate >= checkOut) {
    return { businessDate, window: 'OUTSIDE_STAY' };
  }
  if (businessDate > checkIn) return { businessDate, window: 'OPEN' };

  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: hotel.timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  return {
    businessDate,
    window: localTime < hotel.checkInTime ? 'BEFORE_CHECK_IN_TIME' : 'OPEN',
  };
}
