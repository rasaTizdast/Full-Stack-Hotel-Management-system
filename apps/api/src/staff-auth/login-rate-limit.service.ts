import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type AttemptWindow = {
  attempts: number;
  inFlight: number;
  resetAt: number;
};

const LOGIN_WINDOW_DURATION_MS = 15 * 60 * 1000;
const MAX_IP_REQUESTS = 100;
const MAX_IDENTITY_FAILURES = 5;
const MAX_TRACKED_KEYS = 5000;
const MAX_CLIENT_IP_LENGTH = 128;

@Injectable()
export class LoginRateLimitService {
  private readonly ipRequestWindows = new Map<string, AttemptWindow>();
  private readonly identityWindows = new Map<string, AttemptWindow>();

  assertIpAllowed(clientIp: string, now = Date.now()): void {
    const clientKey = this.normalizeClientIp(clientIp);
    const ipWindow = this.activeWindow(this.ipRequestWindows, clientKey, now);

    if (ipWindow && ipWindow.attempts >= MAX_IP_REQUESTS) {
      this.throwRateLimited();
    }

    this.ipRequestWindows.set(clientKey, {
      attempts: (ipWindow?.attempts ?? 0) + 1,
      inFlight: 0,
      resetAt: ipWindow?.resetAt ?? now + LOGIN_WINDOW_DURATION_MS,
    });
    this.pruneExpired(now);
  }

  assertIdentityAllowed(clientIp: string, email: string, now = Date.now()): void {
    const identityKey = this.identityKey(clientIp, email);
    if (!identityKey) return;

    const current = this.activeWindow(this.identityWindows, identityKey, now);
    if (current && current.attempts + current.inFlight >= MAX_IDENTITY_FAILURES) {
      this.throwRateLimited();
    }

    this.identityWindows.set(identityKey, {
      attempts: current?.attempts ?? 0,
      inFlight: (current?.inFlight ?? 0) + 1,
      resetAt: current?.resetAt ?? now + LOGIN_WINDOW_DURATION_MS,
    });
    this.pruneExpired(now);
  }

  recordFailure(clientIp: string, email: string, now = Date.now()): void {
    const identityKey = this.identityKey(clientIp, email);
    if (!identityKey) return;

    const previous = this.activeWindow(this.identityWindows, identityKey, now);
    this.identityWindows.set(identityKey, {
      attempts: (previous?.attempts ?? 0) + 1,
      inFlight: Math.max(0, (previous?.inFlight ?? 0) - 1),
      resetAt: previous?.resetAt ?? now + LOGIN_WINDOW_DURATION_MS,
    });
    this.pruneExpired(now);
  }

  recordSuccess(clientIp: string, email: string): void {
    const identityKey = this.identityKey(clientIp, email);
    if (!identityKey) return;

    const previous = this.identityWindows.get(identityKey);
    if (!previous || previous.inFlight <= 1) {
      this.identityWindows.delete(identityKey);
      return;
    }

    this.identityWindows.set(identityKey, {
      attempts: 0,
      inFlight: previous.inFlight - 1,
      resetAt: previous.resetAt,
    });
  }

  releaseAttempt(clientIp: string, email: string): void {
    const identityKey = this.identityKey(clientIp, email);
    if (!identityKey) return;

    const previous = this.identityWindows.get(identityKey);
    if (!previous) return;
    if (previous.inFlight <= 1 && previous.attempts === 0) {
      this.identityWindows.delete(identityKey);
      return;
    }

    this.identityWindows.set(identityKey, {
      ...previous,
      inFlight: Math.max(0, previous.inFlight - 1),
    });
  }

  private identityKey(clientIp: string, email: string): string | undefined {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return undefined;

    const identityDigest = createHash('sha256').update(normalizedEmail).digest('hex');
    return `${this.normalizeClientIp(clientIp)}:${identityDigest}`;
  }

  private normalizeClientIp(clientIp: string): string {
    const normalized = clientIp.trim().slice(0, MAX_CLIENT_IP_LENGTH);
    return normalized || 'unknown-client';
  }

  private activeWindow(
    windows: Map<string, AttemptWindow>,
    key: string,
    now: number,
  ): AttemptWindow | undefined {
    const window = windows.get(key);
    if (window && window.resetAt <= now) {
      windows.delete(key);
      return undefined;
    }
    return window;
  }

  private pruneExpired(now: number): void {
    this.pruneMap(this.ipRequestWindows, now);
    this.pruneMap(this.identityWindows, now);
  }

  private pruneMap(windows: Map<string, AttemptWindow>, now: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }

    while (windows.size > MAX_TRACKED_KEYS) {
      const oldestKey = windows.keys().next().value;
      if (oldestKey === undefined) return;
      windows.delete(oldestKey);
    }
  }

  private throwRateLimited(): never {
    throw new HttpException(
      'Too many login attempts. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
