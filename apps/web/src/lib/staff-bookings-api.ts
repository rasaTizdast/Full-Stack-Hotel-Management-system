import { requestStaffApi } from './staff-api';

export type StaffBookingStatus =
  'PENDING_CONFIRMATION' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

export interface StaffBookingListItem {
  reference: string;
  status: StaffBookingStatus;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomQuantity: number;
  guestName: string;
  guestPhone: string;
  roomType: { slug: string; name: string };
  createdAt: string;
  expiresAt: string;
}

export interface StaffBookingNight {
  stayDate: string;
  nightlyPriceToman: string;
  roomQuantity: number;
  amountToman: string;
}

export interface StaffBookingDetail extends StaffBookingListItem {
  id?: string;
  guestEmail: string | null;
  totalPriceToman: string;
  internalNote: string | null;
  cancellationReason: string | null;
  statusTimestamps: {
    confirmedAt: string | null;
    rejectedAt: string | null;
    cancelledAt: string | null;
    expiredAt: string | null;
  };
  nights: StaffBookingNight[];
}

export interface StaffBookingPage {
  items: StaffBookingListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface StaffBookingFilters {
  status?: StaffBookingStatus | '';
  arrivalFrom?: string;
  arrivalTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface StaffBookingActionNote {
  internalNote?: string;
}

export interface StaffBookingCancellation {
  reason: string;
}

export function listStaffBookings(filters: StaffBookingFilters = {}): Promise<StaffBookingPage> {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.arrivalFrom) query.set('arrivalFrom', filters.arrivalFrom);
  if (filters.arrivalTo) query.set('arrivalTo', filters.arrivalTo);
  if (filters.search?.trim()) query.set('search', filters.search.trim());
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));

  const suffix = query.size ? `?${query.toString()}` : '';
  return requestStaffApi<StaffBookingPage>(`bookings${suffix}`);
}

export function getStaffBooking(reference: string): Promise<StaffBookingDetail> {
  return requestStaffApi<StaffBookingDetail>(`bookings/${encodeURIComponent(reference)}`);
}

export function confirmStaffBooking(
  reference: string,
  csrfToken: string,
  action: StaffBookingActionNote = {},
): Promise<StaffBookingDetail> {
  return requestStaffApi<StaffBookingDetail>(`bookings/${encodeURIComponent(reference)}/confirm`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(action),
  });
}

export function rejectStaffBooking(
  reference: string,
  csrfToken: string,
  action: StaffBookingActionNote = {},
): Promise<StaffBookingDetail> {
  return requestStaffApi<StaffBookingDetail>(`bookings/${encodeURIComponent(reference)}/reject`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(action),
  });
}

export function cancelStaffBooking(
  reference: string,
  csrfToken: string,
  action: StaffBookingCancellation,
): Promise<StaffBookingDetail> {
  return requestStaffApi<StaffBookingDetail>(`bookings/${encodeURIComponent(reference)}/cancel`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(action),
  });
}
