import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export interface BookingRequestFingerprintInput {
  roomTypeSlug: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomQuantity: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
}

export function normalizeIranianMobileNumber(value: unknown): string {
  if (typeof value !== 'string' || value.length > 32) {
    return '';
  }

  const asciiDigits = value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  const compact = asciiDigits.trim().replace(/[\s()-]/g, '');
  if (!/^\+?\d+$/.test(compact)) {
    return '';
  }

  let digits = compact.startsWith('+') ? compact.slice(1) : compact;
  if (digits.startsWith('0098')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('98') && digits.length === 12) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  return /^9\d{9}$/.test(digits) ? `+98${digits}` : '';
}

export function calculateBookingTotal(nightlyPrices: bigint[], roomQuantity: number): bigint {
  return nightlyPrices.reduce((total, nightlyPrice) => {
    return total + nightlyPrice * BigInt(roomQuantity);
  }, 0n);
}

export function assertGuestCapacity(
  guestCount: number,
  maxGuestsPerRoom: number,
  roomQuantity: number,
): void {
  if (
    !Number.isInteger(guestCount) ||
    !Number.isInteger(maxGuestsPerRoom) ||
    !Number.isInteger(roomQuantity) ||
    guestCount < 1 ||
    maxGuestsPerRoom < 1 ||
    roomQuantity < 1 ||
    guestCount > maxGuestsPerRoom * roomQuantity
  ) {
    throw new BadRequestException({
      code: 'BOOKING_CAPACITY_EXCEEDED',
      message: 'Guest count exceeds the selected room capacity.',
    });
  }
}

export function hashBookingRequest(input: BookingRequestFingerprintInput): string {
  const normalized = {
    roomTypeSlug: input.roomTypeSlug,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestCount: input.guestCount,
    roomQuantity: input.roomQuantity,
    guestName: input.guestName.trim(),
    guestPhone: normalizeIranianMobileNumber(input.guestPhone),
    guestEmail: input.guestEmail?.trim().toLowerCase() ?? null,
  };
  return createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
}
