import { Transform, Type } from 'class-transformer';
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
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  roomTypeSlug!: string;

  @IsString()
  @Matches(ISO_DATE_ONLY)
  checkIn!: string;

  @IsString()
  @Matches(ISO_DATE_ONLY)
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  guestCount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  roomQuantity!: number;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  guestName!: string;

  @Transform(({ value }: { value: unknown }) => normalizeIranianMobileNumber(value))
  @IsString()
  @Matches(IRANIAN_MOBILE)
  guestPhone!: string;

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
