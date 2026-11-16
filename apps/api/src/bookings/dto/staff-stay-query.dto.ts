import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

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

export class StaffStayQueryDto {
  @ApiPropertyOptional({ format: 'date', example: '2026-11-16' })
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ maxLength: 120, example: 'مریم رضایی' })
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
