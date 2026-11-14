import { Transform } from 'class-transformer';
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
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: (typeof BOOKING_STATUSES)[number];

  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrivalFrom?: string;

  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrivalTo?: string;

  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;

  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
