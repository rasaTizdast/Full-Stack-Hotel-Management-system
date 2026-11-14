import { Type } from 'class-transformer';
import { IsInt, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkIn!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  guests!: number;
}
