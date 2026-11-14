import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiValidationFieldDto {
  @ApiProperty({ example: 'guestEmail' })
  field!: string;

  @ApiProperty({ type: [String], example: ['Must be a valid email address.'] })
  messages!: string[];
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({ example: 'Request validation failed.' })
  message!: string;

  @ApiProperty({ format: 'uuid', example: '4f0d31cf-9f79-4e61-aef6-55cbca9ca3f7' })
  requestId!: string;

  @ApiPropertyOptional({ type: [ApiValidationFieldDto] })
  fields?: ApiValidationFieldDto[];
}
