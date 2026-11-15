import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomTypeId!: string;

  @ApiProperty({ example: '201', maxLength: 32 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  roomNumber!: string;

  @ApiPropertyOptional({ example: '2', maxLength: 32 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  floor?: string | null;

  @ApiPropertyOptional({ type: [String], example: ['balcony', 'city-view'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  @Matches(/\S/, { each: true })
  features?: string[];
}
