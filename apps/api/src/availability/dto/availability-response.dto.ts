import { ApiProperty } from '@nestjs/swagger';
import { AvailabilityRoomTypeDto } from './availability-room-type.dto';

export class AvailabilityResponseDto {
  @ApiProperty({ format: 'date', example: '2027-05-01' })
  checkIn!: string;

  @ApiProperty({ format: 'date', example: '2027-05-04' })
  checkOut!: string;

  @ApiProperty({ example: 2 })
  guests!: number;

  @ApiProperty({ example: 3 })
  numberOfNights!: number;

  @ApiProperty({ type: [AvailabilityRoomTypeDto] })
  roomTypes!: AvailabilityRoomTypeDto[];
}
