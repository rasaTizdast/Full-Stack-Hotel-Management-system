import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_TOMAN_PATTERN = /^(0|[1-9]\d{0,18})$/;

export class UpdateStaffInventoryDto {
  @IsUUID()
  roomTypeId!: string;

  @Matches(DATE_ONLY_PATTERN)
  startDate!: string;

  @Matches(DATE_ONLY_PATTERN)
  endDate!: string;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  totalRooms!: number;

  @IsString()
  @MaxLength(19)
  @Matches(INTEGER_TOMAN_PATTERN)
  nightlyPriceToman!: string;
}
