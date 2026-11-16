import { ApiProperty } from '@nestjs/swagger';
import type { StaffRole } from '../../staff-auth/staff-auth.types';

export class StaffAccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'frontdesk-1' })
  username!: string;

  @ApiProperty({ format: 'email', example: 'frontdesk@example.invalid' })
  email!: string;

  @ApiProperty({ enum: ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPER', 'CASHIER'] })
  role!: StaffRole;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class StaffAccountListDto {
  @ApiProperty({ type: [StaffAccountDto] })
  items!: StaffAccountDto[];

  @ApiProperty({ minimum: 1, example: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 25 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}
