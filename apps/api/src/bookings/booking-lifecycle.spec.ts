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

  it('allows confirmed cancellation only before the hotel business check-in date', () => {
    expect(canCancelConfirmedBooking('2026-11-15', '2026-11-14')).toBe(true);
    expect(canCancelConfirmedBooking('2026-11-14', '2026-11-14')).toBe(false);
    expect(canCancelConfirmedBooking('2026-11-13', '2026-11-14')).toBe(false);
  });
});
