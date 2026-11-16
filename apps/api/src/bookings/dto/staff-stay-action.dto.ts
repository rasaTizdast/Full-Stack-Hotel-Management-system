import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { BookingStatus } from '../../generated/prisma/enums';

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
