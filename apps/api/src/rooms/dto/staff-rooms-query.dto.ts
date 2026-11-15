import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StaffRoomsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  roomTypeId?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  floor?: string;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
