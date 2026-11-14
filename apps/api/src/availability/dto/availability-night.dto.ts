import { ApiProperty } from '@nestjs/swagger';

export class AvailabilityNightDto {
  @ApiProperty({ format: 'date', example: '2027-05-01' })
  stayDate!: string;

  @ApiProperty({ example: true })
  isAvailable!: boolean;

  @ApiProperty({ minimum: 0, example: 2 })
  availableRooms!: number;

  @ApiProperty({ nullable: true, example: '4800000' })
  nightlyPriceToman!: string | null;
}
