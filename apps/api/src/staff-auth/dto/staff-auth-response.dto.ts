import { ApiProperty } from '@nestjs/swagger';

export class PublicStaffDto {
  @ApiProperty({ example: 'hotel-admin' })
  username!: string;

  @ApiProperty({ format: 'email', example: 'admin@example.invalid' })
  email!: string;

  @ApiProperty({ enum: ['ADMIN', 'RECEPTIONIST'], example: 'ADMIN' })
  role!: 'ADMIN' | 'RECEPTIONIST';
}

export class StaffAuthResponseDto {
  @ApiProperty({ type: PublicStaffDto })
  staff!: PublicStaffDto;

  @ApiProperty({
    description:
      'CSRF token returned for the X-CSRF-Token header on state-changing staff requests.',
    example: 'example-csrf-token-not-for-use',
  })
  csrfToken!: string;
}
