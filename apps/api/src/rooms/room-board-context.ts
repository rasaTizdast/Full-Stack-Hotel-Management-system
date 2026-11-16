import type { ReservationContext } from './dto/room-board.dto';
import type { BookingStatus } from '../generated/prisma/enums';

type ReservationInterval = {
  startDate: Date;
  endDate: Date;
  booking: { checkIn: Date; checkOut: Date; status: BookingStatus };
};

export function reservationContextOn(
  day: Date,
  { startDate, endDate, booking }: ReservationInterval,
): ReservationContext | null {
  if (day.getTime() === endDate.getTime() && day.getTime() === booking.checkOut.getTime()) {
    return 'DEPARTING';
  }
  if (day < startDate || day >= endDate) return null;
  if (booking.status === 'CHECKED_IN') return 'IN_HOUSE';
  return day.getTime() === booking.checkIn.getTime() ? 'ARRIVING' : 'RESERVED';
}
