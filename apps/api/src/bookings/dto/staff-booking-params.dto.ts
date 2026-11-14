import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StaffBookingParamsDto {
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{12,16}$', example: 'BKGHTL8Q27KS' })
  @IsString()
  @Length(12, 16)
  @Matches(/^[A-Za-z0-9_-]+$/)
  reference!: string;
}
