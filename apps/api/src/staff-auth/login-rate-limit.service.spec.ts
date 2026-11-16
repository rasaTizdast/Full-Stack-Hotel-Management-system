import { HttpException } from '@nestjs/common';
import { LoginRateLimitService } from './login-rate-limit.service';

describe('LoginRateLimitService', () => {
  it('does not count successful logins against the identity failure budget', () => {
    const rateLimit = new LoginRateLimitService();
    const now = Date.now();
    const ip = '192.0.2.12';

    for (let index = 0; index < 6; index += 1) {
      const email = `staff-${index}@example.invalid`;
      expect(() => {
        rateLimit.assertIpAllowed(ip, now + index);
        rateLimit.assertIdentityAllowed(ip, email, now + index);
      }).not.toThrow();
      rateLimit.recordSuccess(ip, email);
    }
  });

  it('allows five identity failures and rejects the next attempt', () => {
    const rateLimit = new LoginRateLimitService();
    const now = Date.now();
    const ip = '192.0.2.13';
    const email = 'frontdesk@example.invalid';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      rateLimit.assertIpAllowed(ip, now + attempt);
      expect(() => rateLimit.assertIdentityAllowed(ip, email, now + attempt)).not.toThrow();
      rateLimit.recordFailure(ip, email, now + attempt);
    }

    rateLimit.assertIpAllowed(ip, now + 5);
    expect(() => rateLimit.assertIdentityAllowed(ip, email, now + 5)).toThrow(HttpException);
  });

  it('reserves in-flight attempts so concurrent requests cannot exceed the failure limit', () => {
    const rateLimit = new LoginRateLimitService();
    const now = Date.now();
    const ip = '192.0.2.19';
    const email = 'concurrent@example.invalid';

    for (let attempt = 0; attempt < 4; attempt += 1) {
      rateLimit.assertIpAllowed(ip, now + attempt);
      rateLimit.assertIdentityAllowed(ip, email, now + attempt);
      rateLimit.recordFailure(ip, email, now + attempt);
    }

    rateLimit.assertIpAllowed(ip, now + 4);
    rateLimit.assertIdentityAllowed(ip, email, now + 4);
    rateLimit.assertIpAllowed(ip, now + 5);
    expect(() => rateLimit.assertIdentityAllowed(ip, email, now + 5)).toThrow(HttpException);

    rateLimit.recordFailure(ip, email, now + 6);
    rateLimit.assertIpAllowed(ip, now + 7);
    expect(() => rateLimit.assertIdentityAllowed(ip, email, now + 7)).toThrow(HttpException);
  });

  it('admits at most five concurrently reserved attempts for one identity', async () => {
    const rateLimit = new LoginRateLimitService();
    const ip = '192.0.2.23';
    const email = 'parallel@example.invalid';
    const now = Date.now();

    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        Promise.resolve().then(() => {
          rateLimit.assertIpAllowed(ip, now + index);
          rateLimit.assertIdentityAllowed(ip, email, now + index);
          return index;
        }),
      ),
    );

    const accepted = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(accepted).toHaveLength(5);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(HttpException);
      expect((rejected[0].reason as HttpException).getStatus()).toBe(429);
    }
  });

  it('applies the same failure bucket to case and whitespace variants of an email', () => {
    const rateLimit = new LoginRateLimitService();
    const now = Date.now();
    const ip = '192.0.2.14';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      rateLimit.assertIpAllowed(ip, now + attempt);
      rateLimit.assertIdentityAllowed(ip, 'desk@example.invalid', now + attempt);
      rateLimit.recordFailure(ip, 'desk@example.invalid', now + attempt);
    }

    rateLimit.assertIpAllowed(ip, now + 5);
    expect(() => rateLimit.assertIdentityAllowed(ip, '  DESK@EXAMPLE.INVALID ', now + 5)).toThrow(
      HttpException,
    );
  });

  it('clears one identity failure bucket after a valid login', () => {
    const rateLimit = new LoginRateLimitService();
    const now = Date.now();
    const ip = '192.0.2.15';
    const email = 'reset@example.invalid';

    for (let attempt = 0; attempt < 4; attempt += 1) {
      rateLimit.assertIpAllowed(ip, now + attempt);
      rateLimit.assertIdentityAllowed(ip, email, now + attempt);
      rateLimit.recordFailure(ip, email, now + attempt);
    }

    rateLimit.assertIpAllowed(ip, now + 4);
    rateLimit.assertIdentityAllowed(ip, email, now + 4);
    rateLimit.recordSuccess(ip, email);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      rateLimit.assertIpAllowed(ip, now + 5 + attempt);
      expect(() => rateLimit.assertIdentityAllowed(ip, email, now + 5 + attempt)).not.toThrow();
      rateLimit.recordFailure(ip, email, now + 5 + attempt);
    }
    rateLimit.assertIpAllowed(ip, now + 10);
    expect(() => rateLimit.assertIdentityAllowed(ip, email, now + 10)).toThrow(HttpException);
  });

  it('limits total login requests from one IP at 100 within one time window', () => {
    const rateLimit = new LoginRateLimitService();
    const now = Date.now();
    const ip = '192.0.2.16';

    for (let request = 0; request < 100; request += 1) {
      const email = `staff-${request}@example.invalid`;
      rateLimit.assertIpAllowed(ip, now + request);
      rateLimit.assertIdentityAllowed(ip, email, now + request);
      rateLimit.recordSuccess(ip, email);
    }

    expect(() => rateLimit.assertIpAllowed(ip, now + 101)).toThrow(HttpException);
  });

  it('allows attempts again after the 15-minute window expires', () => {
    const rateLimit = new LoginRateLimitService();
    const startedAt = Date.now();
    const ip = '192.0.2.17';
    const email = 'expire@example.invalid';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      rateLimit.assertIpAllowed(ip, startedAt + attempt);
      rateLimit.assertIdentityAllowed(ip, email, startedAt + attempt);
      rateLimit.recordFailure(ip, email, startedAt + attempt);
    }

    const later = startedAt + 15 * 60 * 1000 + 1;
    expect(() => {
      rateLimit.assertIpAllowed(ip, later);
      rateLimit.assertIdentityAllowed(ip, email, later);
    }).not.toThrow();
  });

  it('stores only a hashed identity in failure bucket keys', () => {
    const rateLimit = new LoginRateLimitService();
    const email = 'private@example.invalid';
    rateLimit.assertIdentityAllowed('192.0.2.18', email);
    rateLimit.recordFailure('192.0.2.18', email);

    const identityWindows = (rateLimit as unknown as { identityWindows: Map<string, unknown> })
      .identityWindows;
    expect([...identityWindows.keys()].join('|')).not.toContain(email);
  });
});
