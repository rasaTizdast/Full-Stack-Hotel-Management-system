import type { ReservationContext } from './dto/room-board.dto';

type ReservationInterval = {
  startDate: Date;
  endDate: Date;
  booking: { checkIn: Date; checkOut: Date };
};

export function reservationContextOn(
  day: Date,
  { startDate, endDate, booking }: ReservationInterval,
): ReservationContext | null {
  if (day.getTime() === endDate.getTime() && day.getTime() === booking.checkOut.getTime()) {
    return 'DEPARTING';
  }
  if (day < startDate || day >= endDate) return null;
  return day.getTime() === booking.checkIn.getTime() ? 'ARRIVING' : 'RESERVED';
}
