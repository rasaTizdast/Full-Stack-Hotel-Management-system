import { canCancelConfirmedBooking, resolveBookingTransition } from './booking-lifecycle';

describe('booking lifecycle rules', () => {
  it.each([
    ['PENDING_CONFIRMATION', 'CONFIRM', 'CONFIRMED', 'HELD_TO_BOOKED'],
    ['PENDING_CONFIRMATION', 'REJECT', 'REJECTED', 'RELEASE_HELD'],
    ['PENDING_CONFIRMATION', 'CANCEL', 'CANCELLED', 'RELEASE_HELD'],
    ['PENDING_CONFIRMATION', 'EXPIRE', 'EXPIRED', 'RELEASE_HELD'],
    ['CONFIRMED', 'CANCEL', 'CANCELLED', 'RELEASE_BOOKED'],
  ] as const)(
    '%s can %s to %s with %s inventory effect',
    (status, action, nextStatus, inventoryEffect) => {
      expect(resolveBookingTransition(status, action)).toEqual({
        nextStatus,
        inventoryEffect,
        idempotent: false,
      });
    },
  );

  it.each([
    ['CONFIRMED', 'CONFIRM'],
    ['REJECTED', 'REJECT'],
    ['CANCELLED', 'CANCEL'],
    ['EXPIRED', 'EXPIRE'],
  ] as const)(
    'repeating %s action %s is idempotent and has no inventory effect',
    (status, action) => {
      const decision = resolveBookingTransition(status, action);
      expect(decision).toMatchObject({
        nextStatus: status,
        inventoryEffect: 'NONE',
        idempotent: true,
      });
    },
  );

  it.each([
    ['REJECTED', 'CONFIRM'],
    ['REJECTED', 'CANCEL'],
    ['CANCELLED', 'CONFIRM'],
    ['CANCELLED', 'REJECT'],
    ['EXPIRED', 'CONFIRM'],
    ['EXPIRED', 'REJECT'],
    ['EXPIRED', 'CANCEL'],
    ['CONFIRMED', 'REJECT'],
  ] as const)('%s cannot perform %s', (status, action) => {
    expect(resolveBookingTransition(status, action)).toBeNull();
  });

  it.each([
    [
      'CONFIRMED',
      'CHECK_IN',
      { nextStatus: 'CHECKED_IN', inventoryEffect: 'NONE', idempotent: false },
    ],
    [
      'CONFIRMED',
      'NO_SHOW',
      { nextStatus: 'NO_SHOW', inventoryEffect: 'RELEASE_FUTURE_BOOKED', idempotent: false },
    ],
  ] as const)('%s can %s with the expected inventory effect', (status, action, expected) => {
    expect(resolveBookingTransition(status, action)).toEqual(expected);
  });

  it.each([
    ['CHECKED_IN', 'CHECK_IN', 'CHECKED_IN', 'NONE'],
    ['NO_SHOW', 'NO_SHOW', 'NO_SHOW', 'NONE'],
  ] as const)('%s retries %s idempotently', (status, action, nextStatus, inventoryEffect) => {
    expect(resolveBookingTransition(status, action)).toEqual({
      nextStatus,
      inventoryEffect,
      idempotent: true,
    });
  });

  it.each([
    ['PENDING_CONFIRMATION', 'CHECK_IN'],
    ['PENDING_CONFIRMATION', 'NO_SHOW'],
    ['CHECKED_IN', 'NO_SHOW'],
    ['CHECKED_IN', 'CANCEL'],
    ['CHECKED_OUT', 'CHECK_IN'],
    ['CHECKED_OUT', 'NO_SHOW'],
    ['NO_SHOW', 'CHECK_IN'],
    ['NO_SHOW', 'CANCEL'],
  ] as const)('%s cannot perform stay action %s', (status, action) => {
    expect(resolveBookingTransition(status, action)).toBeNull();
  });

  it('allows confirmed cancellation only before the hotel business check-in date', () => {
    expect(canCancelConfirmedBooking('2026-11-15', '2026-11-14')).toBe(true);
    expect(canCancelConfirmedBooking('2026-11-14', '2026-11-14')).toBe(false);
    expect(canCancelConfirmedBooking('2026-11-13', '2026-11-14')).toBe(false);
  });
});
