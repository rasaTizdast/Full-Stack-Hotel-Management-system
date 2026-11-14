import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

function trimOptionalText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class StaffBookingActionDto {
  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

export class CancelStaffBookingDto {
  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
