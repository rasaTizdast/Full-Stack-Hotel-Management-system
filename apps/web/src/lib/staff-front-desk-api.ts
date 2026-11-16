import { requestStaffApi } from './staff-api';

export type StaffStayQueue = 'arrivals' | 'in-house' | 'departures';
export type StaffStayLifecycleStatus = 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'NO_SHOW';

export interface StaffStayAssignedRoom {
  assignmentId: string;
  roomNumber: string;
  housekeepingStatus: 'DIRTY' | 'CLEAN' | 'INSPECTED';
  startDate: string;
  endDate: string;
}

export interface StaffStayWorklistItem {
  reference: string;
  status: 'CONFIRMED' | 'CHECKED_IN';
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomQuantity: number;
  roomType: { id: string; name: string };
  confirmedAt: string | null;
  checkedInAt: string | null;
  assignedRooms: StaffStayAssignedRoom[];
}

export interface StaffStayWorklist {
  date: string;
  businessDate: string;
  items: StaffStayWorklistItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface StaffStayWorklistQuery {
  date?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface StaffWalkInInput {
  roomTypeSlug: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomQuantity: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
}

export interface StaffStayMutation {
  reference: string;
  status: StaffStayLifecycleStatus;
  checkIn?: string;
  checkOut?: string;
  confirmedAt?: string | null;
  checkedInAt?: string | null;
  noShowAt?: string | null;
}

export interface StaffStayAmendment {
  checkIn?: string;
  checkOut?: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string | null;
  guestCount?: number;
  roomQuantity?: number;
}

export interface StaffStayRoomMove {
  sourceAssignmentId: string;
  targetRoomId: string;
  reason: string;
}

export function getStaffStayWorklist(
  queue: StaffStayQueue,
  filters: StaffStayWorklistQuery = {},
): Promise<StaffStayWorklist> {
  const query = new URLSearchParams();
  if (filters.date) query.set('date', filters.date);
  if (filters.search?.trim()) query.set('search', filters.search.trim());
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));
  const suffix = query.size ? `?${query.toString()}` : '';
  return requestStaffApi<StaffStayWorklist>(`front-desk/${queue}${suffix}`);
}

export function createStaffWalkIn(
  input: StaffWalkInInput,
  csrfToken: string,
  idempotencyKey: string,
): Promise<StaffStayMutation> {
  return requestStaffApi<StaffStayMutation>('bookings/walk-ins', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function checkInStaffStay(
  reference: string,
  csrfToken: string,
  action: { earlyCheckInReason?: string } = {},
): Promise<StaffStayMutation> {
  return requestStaffApi<StaffStayMutation>(`bookings/${encodeURIComponent(reference)}/check-in`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(action),
  });
}

export function markStaffStayNoShow(
  reference: string,
  csrfToken: string,
  action: { reason: string },
): Promise<StaffStayMutation> {
  return requestStaffApi<StaffStayMutation>(`bookings/${encodeURIComponent(reference)}/no-show`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(action),
  });
}

export function amendStaffStay(
  reference: string,
  csrfToken: string,
  amendment: StaffStayAmendment,
): Promise<StaffStayMutation> {
  return requestStaffApi<StaffStayMutation>(`bookings/${encodeURIComponent(reference)}`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(amendment),
  });
}

export function moveStaffStayRoom(
  reference: string,
  csrfToken: string,
  move: StaffStayRoomMove,
): Promise<StaffStayMutation> {
  return requestStaffApi<StaffStayMutation>(`bookings/${encodeURIComponent(reference)}/room-move`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(move),
  });
}
