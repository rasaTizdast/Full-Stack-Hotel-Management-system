export type StaffRole = 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER';

export interface StaffMember {
  username: string;
  email: string;
  role: StaffRole;
  mustChangePassword: boolean;
}

export interface StaffSessionResponse {
  staff: StaffMember;
  csrfToken: string;
}

export interface StaffInventoryRoomType {
  id: string;
  name: string;
  slug: string;
}

export interface StaffInventoryRoomTypeOption extends StaffInventoryRoomType {
  isActive: boolean;
}

export interface StaffInventoryRangeQuery {
  roomTypeId: string;
  startDate: string;
  endDate: string;
}

export interface StaffInventoryRangeUpdate extends StaffInventoryRangeQuery {
  nightlyPriceToman: string;
}

export interface StaffInventoryNight {
  stayDate: string;
  capacitySource: 'PROJECTED' | 'HISTORICAL' | 'UNAVAILABLE';
  totalRooms: number | null;
  blockedRooms: number | null;
  heldRooms: number | null;
  bookedRooms: number | null;
  availableRooms: number | null;
  nightlyPriceToman: string | null;
}

export interface StaffInventoryRangeResponse {
  roomType: StaffInventoryRoomType;
  startDate: string;
  endDate: string;
  nights: StaffInventoryNight[];
}

export interface StaffRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  features: string[];
  housekeepingStatus: 'DIRTY' | 'CLEAN' | 'INSPECTED';
  isActive: boolean;
  isGenerated: boolean;
  roomType: StaffInventoryRoomType;
}

export interface StaffRoomsQuery {
  roomTypeId?: string;
  floor?: string;
  isActive?: boolean;
  search?: string;
}

export interface StaffRoomListResponse {
  items: StaffRoom[];
}

export type StaffRoomOccupancy = 'VACANT' | 'UNKNOWN' | 'OCCUPIED';
export type StaffRoomStayContext = 'ARRIVING' | 'RESERVED' | 'DEPARTING';
export type StaffRoomBlockKind = 'OUT_OF_ORDER' | 'CAPACITY_CLOSED';

export interface StaffRoomBoardReservationContext {
  assignmentId: string;
  reference: string;
  guestName: string;
  startDate: string;
  endDate: string;
  stayContext: StaffRoomStayContext;
}

export interface StaffRoomBoardBlock {
  id: string;
  kind: StaffRoomBlockKind;
  startDate: string;
  endDate: string;
}

export interface StaffRoomBoardItem extends StaffRoom {
  occupancy: StaffRoomOccupancy;
  reservationContexts: StaffRoomBoardReservationContext[];
  blocks: StaffRoomBoardBlock[];
}

export interface StaffRoomBoardAssignmentInterval {
  id: string;
  roomId: string;
  roomNumber: string;
  startDate: string;
  endDate: string;
}

export interface StaffRoomBoardAssignableBooking {
  reference: string;
  guestName: string;
  roomTypeId: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  roomQuantity: number;
  revision: string;
  unassignedRoomQuantity: number;
  assignments: StaffRoomBoardAssignmentInterval[];
}

export interface StaffRoomBoardResponse {
  date: string;
  businessDate: string;
  updatedAt: string;
  items: StaffRoomBoardItem[];
  assignableBookings: StaffRoomBoardAssignableBooking[];
}

export interface StaffRoomBoardQuery {
  date?: string;
  roomTypeId?: string;
  floor?: string;
  occupancy?: StaffRoomOccupancy;
  housekeepingStatus?: StaffRoom['housekeepingStatus'];
  stayContext?: 'NONE' | StaffRoomStayContext;
  blockKind?: 'NONE' | StaffRoomBlockKind;
}

export interface ReplaceStaffBookingRoomAssignments {
  assignments: Array<Pick<StaffRoomBoardAssignmentInterval, 'roomId' | 'startDate' | 'endDate'>>;
  expectedRevision: string;
  reason: string;
}

export interface StaffBookingRoomAssignment {
  id: string;
  roomId: string;
  reference: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  updatedAt: string;
}

export interface StaffBookingRoomAssignmentSet {
  revision: string;
  assignments: StaffBookingRoomAssignment[];
}

export interface StaffRoomCreate {
  roomTypeId: string;
  roomNumber: string;
  floor?: string | null;
  features?: string[];
}

export interface StaffRoomUpdate {
  roomNumber?: string;
  floor?: string | null;
  features?: string[];
}

export interface StaffApiFieldError {
  field: string;
  messages: string[];
}

export class StaffApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fields?: StaffApiFieldError[],
  ) {
    super(message);
    this.name = 'StaffApiError';
  }
}

export const STAFF_SESSION_EXPIRED_EVENT = 'hotel:staff-session-expired';

let currentStaffRequest: Promise<StaffSessionResponse> | null = null;

function staffApiUrl(path: string): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_HOTEL_API_BASE_URL?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !configuredBaseUrl) {
    throw new StaffApiError('نشانی امن سامانه کارکنان پیکربندی نشده است.', 0);
  }

  const baseUrl = (configuredBaseUrl || 'http://localhost:4000/api/v1').replace(/\/$/, '');

  if (isProduction) {
    let apiUrl: URL;
    try {
      apiUrl = new URL(baseUrl);
    } catch {
      throw new StaffApiError('نشانی امن سامانه کارکنان پیکربندی نشده است.', 0);
    }

    if (apiUrl.protocol !== 'https:') {
      throw new StaffApiError('نشانی سامانه کارکنان باید از اتصال امن استفاده کند.', 0);
    }
  }

  return `${baseUrl}/staff/${path.replace(/^\//, '')}`;
}

export async function requestStaffApi<T>(
  path: string,
  options: RequestInit = {},
  redirectOnUnauthorized = true,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(staffApiUrl(path), {
      ...options,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (cause) {
    if (cause instanceof StaffApiError) throw cause;
    throw new StaffApiError('ارتباط با سامانه برقرار نشد. دوباره تلاش کنید.', 0);
  }

  if (response.status === 401 && redirectOnUnauthorized && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STAFF_SESSION_EXPIRED_EVENT));
  }

  if (!response.ok) {
    let message = 'درخواست انجام نشد. دوباره تلاش کنید.';
    let code: string | undefined;
    let fields: StaffApiFieldError[] | undefined;
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
        if ('message' in body && typeof body.message === 'string') message = body.message;
        if ('code' in body && typeof body.code === 'string') code = body.code;
        if ('fields' in body && Array.isArray(body.fields)) {
          fields = body.fields.flatMap((field): StaffApiFieldError[] => {
            if (
              typeof field !== 'object' ||
              field === null ||
              !('field' in field) ||
              typeof field.field !== 'string' ||
              !('messages' in field) ||
              !Array.isArray(field.messages) ||
              !field.messages.every((fieldMessage: unknown) => typeof fieldMessage === 'string')
            ) {
              return [];
            }
            return [{ field: field.field, messages: field.messages }];
          });
        }
      }
    } catch {
      // Use the stable fallback for non-JSON responses.
    }
    throw new StaffApiError(message, response.status, code, fields);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function loginStaff(email: string, password: string): Promise<StaffSessionResponse> {
  return requestStaffApi<StaffSessionResponse>(
    'auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    false,
  );
}

export function getCurrentStaff(): Promise<StaffSessionResponse> {
  if (currentStaffRequest) return currentStaffRequest;

  currentStaffRequest = requestStaffApi<StaffSessionResponse>('auth/me').finally(() => {
    currentStaffRequest = null;
  });
  return currentStaffRequest;
}

export function logoutStaff(csrfToken: string): Promise<void> {
  return requestStaffApi<void>('auth/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}

export function changeStaffPassword(
  currentPassword: string,
  newPassword: string,
  csrfToken: string,
): Promise<void> {
  return requestStaffApi<void>('auth/change-password', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function getStaffInventoryRoomTypes(): Promise<StaffInventoryRoomTypeOption[]> {
  return requestStaffApi<StaffInventoryRoomTypeOption[]>('inventory/room-types');
}

export function getStaffInventoryRange(
  query: StaffInventoryRangeQuery,
): Promise<StaffInventoryRangeResponse> {
  const params = new URLSearchParams({
    roomTypeId: query.roomTypeId,
    startDate: query.startDate,
    endDate: query.endDate,
  });
  return requestStaffApi<StaffInventoryRangeResponse>(`inventory?${params.toString()}`);
}

export function updateStaffInventoryRange(
  update: StaffInventoryRangeUpdate,
  csrfToken: string,
): Promise<StaffInventoryRangeResponse> {
  return requestStaffApi<StaffInventoryRangeResponse>('inventory', {
    method: 'PUT',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(update),
  });
}

export function getStaffRooms(query: StaffRoomsQuery = {}): Promise<StaffRoomListResponse> {
  const params = new URLSearchParams();
  if (query.roomTypeId) params.set('roomTypeId', query.roomTypeId);
  if (query.floor) params.set('floor', query.floor);
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  if (query.search) params.set('search', query.search);
  const search = params.toString();
  return requestStaffApi<StaffRoomListResponse>(`rooms${search ? `?${search}` : ''}`);
}

export function getStaffRoomBoard(
  query: StaffRoomBoardQuery = {},
): Promise<StaffRoomBoardResponse> {
  const params = new URLSearchParams();
  if (query.date) params.set('date', query.date);
  if (query.roomTypeId) params.set('roomTypeId', query.roomTypeId);
  if (query.floor) params.set('floor', query.floor);
  if (query.occupancy) params.set('occupancy', query.occupancy);
  if (query.housekeepingStatus) params.set('housekeepingStatus', query.housekeepingStatus);
  if (query.stayContext) params.set('stayContext', query.stayContext);
  if (query.blockKind) params.set('blockKind', query.blockKind);
  const search = params.toString();
  return requestStaffApi<StaffRoomBoardResponse>(
    `rooms/board${search ? `?${search}` : ''}`,
  );
}

export function replaceStaffBookingRoomAssignments(
  reference: string,
  replacement: ReplaceStaffBookingRoomAssignments,
  csrfToken: string,
): Promise<StaffBookingRoomAssignmentSet> {
  return requestStaffApi<StaffBookingRoomAssignmentSet>(
    `bookings/${encodeURIComponent(reference)}/room-assignments`,
    {
      method: 'PUT',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(replacement),
    },
  );
}

export function createStaffRoom(room: StaffRoomCreate, csrfToken: string): Promise<StaffRoom> {
  return requestStaffApi<StaffRoom>('rooms', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(room),
  });
}

export function updateStaffRoom(
  roomId: string,
  update: StaffRoomUpdate,
  csrfToken: string,
): Promise<StaffRoom> {
  return requestStaffApi<StaffRoom>(`rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(update),
  });
}

export function deactivateStaffRoom(roomId: string, csrfToken: string): Promise<StaffRoom> {
  return requestStaffApi<StaffRoom>(`rooms/${encodeURIComponent(roomId)}/deactivate`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}

export function reactivateStaffRoom(roomId: string, csrfToken: string): Promise<StaffRoom> {
  return requestStaffApi<StaffRoom>(`rooms/${encodeURIComponent(roomId)}/reactivate`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}
