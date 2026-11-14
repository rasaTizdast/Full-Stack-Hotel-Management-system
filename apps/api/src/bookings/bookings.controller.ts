import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingRateLimitGuard } from './booking-rate-limit.guard';
import { BookingsService } from './bookings.service';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;

@ApiTags('Guest booking requests')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(BookingRateLimitGuard)
  @ApiOperation({
    summary: 'Submit a booking request.',
    description:
      'Creates a pending request, not a confirmed reservation. Staff must confirm it. No online payment is taken.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '16–128 characters. Reuse the key only when retrying the same request.',
    example: 'hotel-demo-request-001',
  })
  @ApiCreatedResponse({
    type: BookingResponseDto,
    description: 'The pending booking request was created.',
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: 'The request or idempotency key is invalid.',
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'The room type is no longer available.',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Availability or idempotency state changed.',
  })
  @ApiTooManyRequestsResponse({
    type: ApiErrorResponseDto,
    description: 'Booking request rate limit was reached.',
  })
  create(
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BookingResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'The Idempotency-Key header is required.',
      });
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Use a 16 to 128 character idempotency key with letters, numbers, or . _ ~ -.',
      });
    }
    return this.bookings.create(dto, idempotencyKey);
  }
}
