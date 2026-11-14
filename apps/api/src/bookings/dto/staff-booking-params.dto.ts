import { IsString, Length, Matches } from 'class-validator';

export class StaffBookingParamsDto {
  @IsString()
  @Length(12, 16)
  @Matches(/^[A-Za-z0-9_-]+$/)
  reference!: string;
}
