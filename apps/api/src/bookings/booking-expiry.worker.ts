import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingsService } from './bookings.service';

const EXPIRY_SCAN_INTERVAL_MS = 60_000;
const SAFE_NODE_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
]);

export interface BookingExpiryResult {
  scanned: number;
  expired: number;
  failed: number;
}

@Injectable()
export class BookingExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingExpiryWorker.name);
  private interval: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly bookings: BookingsService) {}

  onModuleInit(): void {
    this.interval = setInterval(() => {
      void this.runOnce();
    }, EXPIRY_SCAN_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async runOnce(): Promise<BookingExpiryResult> {
    if (this.running) return { scanned: 0, expired: 0, failed: 0 };
    this.running = true;

    try {
      let bookingIds: string[];
      try {
        bookingIds = await this.bookings.findDuePendingBookingIds();
      } catch (error) {
        this.logSafeFailure('scan', error);
        return { scanned: 0, expired: 0, failed: 1 };
      }

      let expired = 0;
      let failed = 0;
      for (const bookingId of bookingIds) {
        try {
          if (await this.bookings.expirePending(bookingId)) expired += 1;
        } catch (error) {
          failed += 1;
          this.logSafeFailure(bookingId, error);
        }
      }
      return { scanned: bookingIds.length, expired, failed };
    } finally {
      this.running = false;
    }
  }

  private logSafeFailure(bookingId: string, error: unknown): void {
    const code = this.safeErrorCode(error);
    this.logger.error(`Booking expiry failed bookingId=${bookingId} errorCode=${code}`);
  }

  private safeErrorCode(error: unknown): string {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return 'UNEXPECTED_ERROR';
    }
    const code = error.code;
    if (typeof code !== 'string') return 'UNEXPECTED_ERROR';
    if (/^P\d{4}$/.test(code) || SAFE_NODE_ERROR_CODES.has(code)) return code;
    return 'UNEXPECTED_ERROR';
  }
}
