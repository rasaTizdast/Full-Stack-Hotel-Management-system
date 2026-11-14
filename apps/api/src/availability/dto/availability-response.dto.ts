import { AvailabilityRoomTypeDto } from './availability-room-type.dto';

export class AvailabilityResponseDto {
  checkIn!: string;
  checkOut!: string;
  guests!: number;
  numberOfNights!: number;
  roomTypes!: AvailabilityRoomTypeDto[];
}
