import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({ format: 'date', example: '2027-05-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkIn!: string;

  @ApiProperty({ format: 'date', example: '2027-05-04' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 20, example: 2 })
  @Type(() => Number)
  @IsInt()
  guests!: number;
}
