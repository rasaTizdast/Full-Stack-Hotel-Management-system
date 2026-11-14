import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { normalizeIranianMobileNumber } from '../booking-rules';

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const IRANIAN_MOBILE = /^\+989\d{9}$/;

export class CreateBookingDto {
  @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', example: 'garden-double' })
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  roomTypeSlug!: string;

  @ApiProperty({ format: 'date', example: '2027-05-01' })
  @IsString()
  @Matches(ISO_DATE_ONLY)
  checkIn!: string;

  @ApiProperty({ format: 'date', example: '2027-05-04' })
  @IsString()
  @Matches(ISO_DATE_ONLY)
  checkOut!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 20, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  guestCount!: number;

  @ApiProperty({ type: Number, minimum: 1, maximum: 20, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  roomQuantity!: number;

  @ApiProperty({ minLength: 2, maxLength: 160, example: 'مریم رضایی' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  guestName!: string;

  @ApiProperty({
    pattern: '^\\+989\\d{9}$',
    example: '+989121234567',
    description: 'Iranian mobile number normalized to international format.',
  })
  @Transform(({ value }: { value: unknown }) => normalizeIranianMobileNumber(value))
  @IsString()
  @Matches(IRANIAN_MOBILE)
  guestPhone!: string;

  @ApiPropertyOptional({ format: 'email', maxLength: 254, example: 'guest@example.invalid' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed.toLowerCase();
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  guestEmail?: string;
}
