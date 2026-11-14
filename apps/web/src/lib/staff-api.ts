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

export class StaffApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
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

async function requestStaffApi<T>(
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
    try {
      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
      ) {
        message = body.message;
      }
    } catch {
      // Use the stable fallback for non-JSON responses.
    }
    throw new StaffApiError(message, response.status);
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
