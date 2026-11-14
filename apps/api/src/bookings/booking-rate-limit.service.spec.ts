import { HttpException } from '@nestjs/common';
import { BookingRateLimitService } from './booking-rate-limit.service';

describe('BookingRateLimitService', () => {
  it('returns HTTP 429 after one client exceeds the request window', () => {
    const service = new BookingRateLimitService();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(() => service.consume('test-client', 1_000)).not.toThrow();
    }

    try {
      service.consume('test-client', 1_000);
      throw new Error('Expected the client request limit to be enforced.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('accepts requests after the previous client window expires', () => {
    const service = new BookingRateLimitService();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      service.consume('test-client', 1_000);
    }

    expect(() => service.consume('test-client', 901_001)).not.toThrow();
  });
});
