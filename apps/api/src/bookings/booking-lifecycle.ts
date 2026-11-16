export type BookingStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'NO_SHOW';

export type BookingAction = 'CONFIRM' | 'REJECT' | 'CANCEL' | 'EXPIRE' | 'CHECK_IN' | 'NO_SHOW';

export type InventoryEffect =
  'HELD_TO_BOOKED' | 'RELEASE_HELD' | 'RELEASE_BOOKED' | 'RELEASE_FUTURE_BOOKED' | 'NONE';

export interface BookingTransitionDecision {
  nextStatus: BookingStatus;
  inventoryEffect: InventoryEffect;
  idempotent: boolean;
}

export function resolveBookingTransition(
  status: BookingStatus,
  action: BookingAction,
): BookingTransitionDecision | null {
  const targetByAction: Record<BookingAction, BookingStatus> = {
    CONFIRM: 'CONFIRMED',
    REJECT: 'REJECTED',
    CANCEL: 'CANCELLED',
    EXPIRE: 'EXPIRED',
    CHECK_IN: 'CHECKED_IN',
    NO_SHOW: 'NO_SHOW',
  };
  const nextStatus = targetByAction[action];
  if (status === nextStatus) {
    return { nextStatus, inventoryEffect: 'NONE', idempotent: true };
  }

  if (status === 'PENDING_CONFIRMATION') {
    if (action === 'CONFIRM') {
      return { nextStatus, inventoryEffect: 'HELD_TO_BOOKED', idempotent: false };
    }
    if (action === 'REJECT' || action === 'CANCEL' || action === 'EXPIRE') {
      return { nextStatus, inventoryEffect: 'RELEASE_HELD', idempotent: false };
    }
  }

  if (status === 'CONFIRMED' && action === 'CANCEL') {
    return { nextStatus, inventoryEffect: 'RELEASE_BOOKED', idempotent: false };
  }

  if (status === 'CONFIRMED' && action === 'CHECK_IN') {
    return { nextStatus, inventoryEffect: 'NONE', idempotent: false };
  }

  if (status === 'CONFIRMED' && action === 'NO_SHOW') {
    return { nextStatus, inventoryEffect: 'RELEASE_FUTURE_BOOKED', idempotent: false };
  }

  return null;
}

export function canCancelConfirmedBooking(checkIn: string, businessDate: string): boolean {
  return checkIn > businessDate;
}
