import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { StaffRole } from '../../staff-auth/staff-auth.types';

const STAFF_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPER', 'CASHIER'];

export class ChangeStaffRoleDto {
  @ApiProperty({ enum: STAFF_ROLES })
  @IsIn(STAFF_ROLES)
  role!: StaffRole;

  @ApiProperty({ minLength: 1, maxLength: 500, example: 'Coverage responsibilities changed.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
