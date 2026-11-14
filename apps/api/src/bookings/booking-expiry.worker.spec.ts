import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingExpiryWorker } from './booking-expiry.worker';
import { BookingsService } from './bookings.service';

describe('BookingExpiryWorker', () => {
  let moduleFixture: TestingModule;
  let worker: BookingExpiryWorker;
  const bookings = {
    findDuePendingBookingIds: jest.fn(),
    expirePending: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleFixture = await Test.createTestingModule({
      providers: [BookingExpiryWorker, { provide: BookingsService, useValue: bookings }],
    }).compile();
    worker = moduleFixture.get(BookingExpiryWorker);
  });

  afterEach(async () => {
    await moduleFixture.close();
    jest.restoreAllMocks();
  });

  it('logs a safe error code without guest PII when an expiry fails', async () => {
    const guestPhone = '989121234567';
    bookings.findDuePendingBookingIds.mockResolvedValue(['booking-internal-id']);
    bookings.expirePending.mockRejectedValue(
      Object.assign(new Error('expiry failed'), { code: guestPhone }),
    );
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const result = await worker.runOnce();

    expect(result).toEqual({ scanned: 1, expired: 0, failed: 1 });
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain(guestPhone);
  });

  it('continues the batch after one booking failure', async () => {
    bookings.findDuePendingBookingIds.mockResolvedValue(['first-id', 'second-id']);
    bookings.expirePending
      .mockRejectedValueOnce(new Error('private failure'))
      .mockResolvedValueOnce(true);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const result = await worker.runOnce();

    expect(result).toEqual({ scanned: 2, expired: 1, failed: 1 });
    expect(bookings.expirePending).toHaveBeenCalledTimes(2);
  });
});
