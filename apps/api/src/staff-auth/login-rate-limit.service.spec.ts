import { HttpException } from '@nestjs/common';
import { LoginRateLimitService } from './login-rate-limit.service';

describe('LoginRateLimitService', () => {
  it('allows five attempts then rejects the next attempt in the same window', () => {
    const rateLimit = new LoginRateLimitService();
    const startedAt = Date.now();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => rateLimit.consume('client-a', startedAt + attempt)).not.toThrow();
    }

    try {
      rateLimit.consume('client-a', startedAt + 5);
      throw new Error('Expected login attempt limit to be enforced.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('keeps separate client addresses in independent windows', () => {
    const rateLimit = new LoginRateLimitService();
    const now = Date.now();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      rateLimit.consume('client-a', now + attempt);
    }

    expect(() => rateLimit.consume('client-b', now + 5)).not.toThrow();
  });

  it('allows attempts again after the window expires', () => {
    const rateLimit = new LoginRateLimitService();
    const startedAt = Date.now();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      rateLimit.consume('client-a', startedAt + attempt);
    }

    expect(() => rateLimit.consume('client-a', startedAt + 15 * 60 * 1000 + 1)).not.toThrow();
  });
});
