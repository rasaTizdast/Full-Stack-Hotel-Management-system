import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { BookingStatus } from '../../generated/prisma/enums';
import { CreateBookingDto } from './create-booking.dto';

export class CheckInStaffStayDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Required for ADMIN or MANAGER check-in before the configured arrival time.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  earlyCheckInReason?: string;
}

export class NoShowStaffStayDto {
  @ApiProperty({ minLength: 1, maxLength: 500, description: 'Operational reason for the no-show.' })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class AmendStaffStayDto extends PartialType(
  OmitType(CreateBookingDto, ['roomTypeSlug', 'guestCount', 'roomQuantity', 'guestEmail']),
  { skipNullProperties: false },
) {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 20 })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(20)
  guestCount?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 20 })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(20)
  roomQuantity?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'email',
    maxLength: 254,
    nullable: true,
    description: 'Pass null to remove the saved email.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  guestEmail?: string | null;
}

export class MoveStaffRoomDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The active room assignment ID from the in-house worklist.',
  })
  @IsUUID()
  sourceAssignmentId!: string;

  @ApiProperty({ format: 'uuid', description: 'An inspected room of the same room type.' })
  @IsUUID()
  targetRoomId!: string;

  @ApiProperty({ minLength: 1, maxLength: 500, description: 'Operational reason for the move.' })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ExtendCheckedInStayDto {
  @ApiProperty({
    format: 'date',
    description: 'New exclusive checkout date in Gregorian YYYY-MM-DD format.',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut!: string;

  @ApiProperty({ minLength: 1, maxLength: 500, description: 'Reason for extending the stay.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class StaffStayMutationDto {
  @ApiProperty()
  reference!: string;

  @ApiProperty({ enum: BookingStatus })
  status!: BookingStatus;

  @ApiProperty({ format: 'date' })
  checkIn!: string;

  @ApiProperty({ format: 'date' })
  checkOut!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  confirmedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  checkedInAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  noShowAt!: string | null;
}
