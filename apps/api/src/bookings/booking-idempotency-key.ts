import { BadRequestException } from '@nestjs/common';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;

export function requireBookingIdempotencyKey(key?: string): string {
  if (!key) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'The Idempotency-Key header is required.',
    });
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_INVALID',
      message: 'Use a 16 to 128 character idempotency key with letters, numbers, or . _ ~ -.',
    });
  }
  return key;
}
