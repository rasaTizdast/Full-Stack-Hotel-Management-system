import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { StaffRole } from '../../staff-auth/staff-auth.types';

const STAFF_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPER', 'CASHIER'];

function normalizeIdentity(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class CreateStaffAccountDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'frontdesk-1' })
  @Transform(({ value }: { value: unknown }) => normalizeIdentity(value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  username!: string;

  @ApiProperty({ format: 'email', maxLength: 254, example: 'frontdesk@example.invalid' })
  @Transform(({ value }: { value: unknown }) => normalizeIdentity(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  initialPassword!: string;

  @ApiProperty({ enum: STAFF_ROLES })
  @IsIn(STAFF_ROLES)
  role!: StaffRole;
}
