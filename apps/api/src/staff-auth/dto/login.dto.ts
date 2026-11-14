import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

function normalizeEmailInput(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class LoginDto {
  @ApiProperty({ format: 'email', maxLength: 254, example: 'admin@example.invalid' })
  @Transform(({ value }: { value: unknown }) => normalizeEmailInput(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    format: 'password',
    minLength: 12,
    maxLength: 128,
    description: 'Development-only credentials come from DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD.',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
