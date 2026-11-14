import { IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class StaffInventoryRangeQueryDto {
  @ApiProperty({ format: 'uuid', example: '7d921ea5-0f71-4d39-9608-4fb190080065' })
  @IsUUID()
  roomTypeId!: string;

  @ApiProperty({ format: 'date', example: '2027-05-01' })
  @Matches(DATE_ONLY_PATTERN)
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2027-05-08' })
  @Matches(DATE_ONLY_PATTERN)
  endDate!: string;
}
