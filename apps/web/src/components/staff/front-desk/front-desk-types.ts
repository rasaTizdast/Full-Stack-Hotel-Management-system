import type { StaffStayWorklistItem } from '@/lib/staff-front-desk-api';

export type ListState = 'loading' | 'ready' | 'error';

export type DialogState =
  | { kind: 'check-in'; stay: StaffStayWorklistItem }
  | { kind: 'no-show'; stay: StaffStayWorklistItem }
  | { kind: 'walk-in' }
  | { kind: 'move'; stay: StaffStayWorklistItem }
  | null;

export interface WalkInDraft {
  roomTypeSlug: string;
  checkOut: string;
  guestCount: string;
  roomQuantity: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
}

export interface AmendmentDraft {
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestCount: string;
  roomQuantity: string;
  checkIn: string;
  checkOut: string;
}
