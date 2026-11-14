import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type AttemptWindow = {
  attempts: number;
  resetAt: number;
};

@Injectable()
export class LoginRateLimitService {
  private static readonly maximumAttempts = 5;
  private static readonly windowDurationMs = 15 * 60 * 1000;
  private static readonly maximumTrackedClients = 5000;

  private readonly windows = new Map<string, AttemptWindow>();

  consume(clientKey: string, now = Date.now()): void {
    const previous = this.windows.get(clientKey);
    const current = previous && previous.resetAt > now ? previous : undefined;

    if (current && current.attempts >= LoginRateLimitService.maximumAttempts) {
      throw new HttpException(
        'Too many login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.windows.set(clientKey, {
      attempts: (current?.attempts ?? 0) + 1,
      resetAt: current?.resetAt ?? now + LoginRateLimitService.windowDurationMs,
    });
    this.pruneExpired(now);
  }

  private pruneExpired(now: number): void {
    if (this.windows.size <= LoginRateLimitService.maximumTrackedClients) {
      return;
    }

    for (const [clientKey, window] of this.windows) {
      if (
        window.resetAt <= now ||
        this.windows.size > LoginRateLimitService.maximumTrackedClients
      ) {
        this.windows.delete(clientKey);
      }
    }
  }
}
