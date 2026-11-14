import { IsUUID, Matches } from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class StaffInventoryRangeQueryDto {
  @IsUUID()
  roomTypeId!: string;

  @Matches(DATE_ONLY_PATTERN)
  startDate!: string;

  @Matches(DATE_ONLY_PATTERN)
  endDate!: string;
}
