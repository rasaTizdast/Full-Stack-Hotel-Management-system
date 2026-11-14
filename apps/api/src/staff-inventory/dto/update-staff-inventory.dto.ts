import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_TOMAN_PATTERN = /^(0|[1-9]\d{0,18})$/;

export class UpdateStaffInventoryDto {
  @ApiProperty({ format: 'uuid', example: '7d921ea5-0f71-4d39-9608-4fb190080065' })
  @IsUUID()
  roomTypeId!: string;

  @ApiProperty({ format: 'date', example: '2027-05-01' })
  @Matches(DATE_ONLY_PATTERN)
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2027-05-08', description: 'Exclusive end date.' })
  @Matches(DATE_ONLY_PATTERN)
  endDate!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 2_147_483_647, example: 4 })
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  totalRooms!: number;

  @ApiProperty({ pattern: '^(0|[1-9]\\d{0,18})$', example: '4800000' })
  @IsString()
  @MaxLength(19)
  @Matches(INTEGER_TOMAN_PATTERN)
  nightlyPriceToman!: string;
}
