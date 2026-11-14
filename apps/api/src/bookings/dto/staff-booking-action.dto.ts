import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

function trimOptionalText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class StaffBookingActionDto {
  @ApiPropertyOptional({ maxLength: 1000, example: 'Inventory has been confirmed by the hotel.' })
  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

export class CancelStaffBookingDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 500,
    example: 'Cancelled at the guest’s request.',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
