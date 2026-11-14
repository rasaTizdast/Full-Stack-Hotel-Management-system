export const STAFF_SESSION_COOKIE = 'hotel_staff_session';
export const STAFF_CSRF_COOKIE = 'hotel_staff_csrf';
export const STAFF_COOKIE_PATH = '/api/v1/staff';
export const STAFF_SESSION_TTL_SECONDS = 12 * 60 * 60;

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    return part.slice(separator + 1).trim();
  }

  return undefined;
}

export function serializeStaffCookie(
  name: string,
  value: string,
  secure: boolean,
  maxAgeSeconds = STAFF_SESSION_TTL_SECONDS,
): string {
  return [
    `${name}=${value}`,
    `Path=${STAFF_COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearStaffCookie(name: string, secure: boolean): string {
  return [
    `${name}=`,
    `Path=${STAFF_COOKIE_PATH}`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
