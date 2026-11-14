import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const BOOKING_STATUSES = [
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;

function trimQueryValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function toOptionalInteger(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return value;
  return Number(value);
}

export class StaffBookingsQueryDto {
  @ApiPropertyOptional({
    enum: BOOKING_STATUSES,
    example: 'PENDING_CONFIRMATION',
  })
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: (typeof BOOKING_STATUSES)[number];

  @ApiPropertyOptional({ format: 'date', example: '2027-05-01' })
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrivalFrom?: string;

  @ApiPropertyOptional({ format: 'date', example: '2027-05-31' })
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrivalTo?: string;

  @ApiPropertyOptional({ maxLength: 120, example: 'BKGHTL8Q27KS' })
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100_000, example: 1 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, example: 20 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
