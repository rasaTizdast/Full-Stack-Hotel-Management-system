import { ApiProperty } from '@nestjs/swagger';
import { AvailabilityNightDto } from './availability-night.dto';

export class AvailabilityRoomTypeDto {
  @ApiProperty({ example: 'garden-double' })
  slug!: string;

  @ApiProperty({ example: 'اتاق دوتخته باغ' })
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 20, example: 2 })
  maxGuestsPerRoom!: number;

  @ApiProperty({ example: true })
  isAvailable!: boolean;

  @ApiProperty({ minimum: 0, example: 2 })
  availableRooms!: number;

  @ApiProperty({ nullable: true, example: '9600000' })
  totalPriceToman!: string | null;

  @ApiProperty({ type: [AvailabilityNightDto] })
  nightlyBreakdown!: AvailabilityNightDto[];
}
