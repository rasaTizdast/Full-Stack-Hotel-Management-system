export type StaffRole = 'ADMIN' | 'RECEPTIONIST';

export interface StaffMember {
  username: string;
  email: string;
  role: StaffRole;
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
  totalRooms: number;
  nightlyPriceToman: string;
}

export interface StaffInventoryNight {
  stayDate: string;
  totalRooms: number | null;
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
