import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, request as playwrightRequest, test as base, type Page } from '@playwright/test';
import { getE2eDatabaseUrl, getE2eEnvironmentValue } from './test-database';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const webPort = process.env.HBE_E2E_WEB_PORT ?? '3015';
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const webOrigin = `http://127.0.0.1:${webPort}`;

export interface StaffBrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax';
}

export type BookingCreated = (reference?: string) => void;

export type CleanupRegistrar = (cleanup: () => Promise<void>) => void;

interface StaffWorkerFixtures {
  staffCookies: StaffBrowserCookie[];
}

function localEnvValue(name: string): string | undefined {
  return getE2eEnvironmentValue(name, resolve(process.cwd(), '../..'));
}

function adminCredentials() {
  const email = process.env.DEMO_ADMIN_EMAIL ?? localEnvValue('DEMO_ADMIN_EMAIL');
  const password = process.env.DEMO_ADMIN_PASSWORD ?? localEnvValue('DEMO_ADMIN_PASSWORD');
  if (!email || !password) {
    throw new Error('Set fictional demo admin credentials in the local .env.');
  }
  return { email, password };
}

function parseStaffCookies(setCookieHeaders: string[]): StaffBrowserCookie[] {
  return setCookieHeaders.flatMap((header) => {
    const [pair, ...attributes] = header.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    if (separator < 1) return [];
    const attributeValue = (name: string) =>
      attributes
        .find((attribute) => attribute.toLowerCase().startsWith(`${name}=`))
        ?.slice(name.length + 1);

    return [
      {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        domain: '127.0.0.1',
        path: attributeValue('path') ?? '/api/v1/staff',
        httpOnly: attributes.some((attribute) => attribute.toLowerCase() === 'httponly'),
        secure: attributes.some((attribute) => attribute.toLowerCase() === 'secure'),
        sameSite: 'Lax' as const,
      },
    ];
  });
}

export const test = base.extend<object, StaffWorkerFixtures>({
  staffCookies: [
    async ({}, use) => {
      const apiContext = await playwrightRequest.newContext();
      let cookies: StaffBrowserCookie[] = [];
      try {
        const response = await apiContext.post(`${apiBaseUrl}/staff/auth/login`, {
          headers: { Origin: webOrigin, Referer: `${webOrigin}/staff/login` },
          data: adminCredentials(),
        });
        expect(response.status()).toBe(200);
        const headers = await response.headersArray();
        cookies = parseStaffCookies(
          headers
            .filter((header) => header.name.toLowerCase() === 'set-cookie')
            .map((header) => header.value),
        );
        expect(cookies.map((cookie) => cookie.name)).toEqual(
          expect.arrayContaining(['hotel_staff_session', 'hotel_staff_csrf']),
        );
      } catch (cause) {
        await apiContext.dispose();
        throw cause;
      }
      await withFailureSafeCleanup(async (registerCleanup) => {
        registerCleanup(async () => apiContext.dispose());
        registerCleanup(async () => {
          const sessionResponse = await apiContext.get(`${apiBaseUrl}/staff/auth/me`, {
            headers: { Origin: webOrigin, Referer: `${webOrigin}/staff` },
          });
          if (!sessionResponse.ok()) {
            throw new Error(
              `The staff test session refresh returned HTTP ${sessionResponse.status()}.`,
            );
          }
          const session: unknown = await sessionResponse.json();
          if (!isRecord(session) || typeof session.csrfToken !== 'string' || !session.csrfToken) {
            throw new Error('The staff session refresh had no CSRF token for logout.');
          }

          const response = await apiContext.post(`${apiBaseUrl}/staff/auth/logout`, {
            headers: {
              Origin: webOrigin,
              Referer: `${webOrigin}/staff`,
              'X-CSRF-Token': session.csrfToken,
            },
          });
          if (response.status() !== 204) {
            throw new Error(`The staff test session logout returned HTTP ${response.status()}.`);
          }
        });
        await use(cookies);
      });
    },
    { scope: 'worker' },
  ],
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function withFailureSafeCleanup<T>(
  scenario: (registerCleanup: CleanupRegistrar) => Promise<T>,
): Promise<T> {
  const cleanups: Array<() => Promise<void>> = [];
  let result: T;
  let scenarioFailed = false;
  let scenarioFailure: unknown;

  try {
    result = await scenario((cleanup) => cleanups.push(cleanup));
  } catch (cause) {
    scenarioFailed = true;
    scenarioFailure = cause;
  } finally {
    const cleanupFailures: string[] = [];
    for (const cleanup of cleanups.reverse()) {
      try {
        await cleanup();
      } catch (cause) {
        cleanupFailures.push(errorMessage(cause));
      }
    }

    if (cleanupFailures.length > 0) {
      const cleanupMessage = cleanupFailures.join('\n');
      if (scenarioFailed) {
        throw new Error(
          `${errorMessage(scenarioFailure)}\nFixture cleanup also failed: ${cleanupMessage}`,
          { cause: scenarioFailure },
        );
      }
      throw new Error(`Fixture cleanup failed: ${cleanupMessage}`);
    }
  }

  if (scenarioFailed) throw scenarioFailure;
  return result!;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function staffHeaders(page: Page, fallbackCookies: StaffBrowserCookie[]) {
  const currentCookies = await page.context().cookies(`${apiBaseUrl}/staff`);
  const cookies = new Map(currentCookies.map((cookie) => [cookie.name, cookie.value]));
  for (const cookie of fallbackCookies) {
    if (!cookies.has(cookie.name)) cookies.set(cookie.name, cookie.value);
  }

  const session = cookies.get('hotel_staff_session');
  const csrf = cookies.get('hotel_staff_csrf');
  if (!session || !csrf) {
    throw new Error('The staff session was unavailable for fixture cleanup.');
  }

  return {
    Cookie: `hotel_staff_session=${session}; hotel_staff_csrf=${csrf}`,
    'X-CSRF-Token': csrf,
  };
}

async function findFixtureBookingReferences(
  page: Page,
  headers: Record<string, string>,
  guestPhone: string,
): Promise<string[]> {
  const query = new URLSearchParams({ search: guestPhone, page: '1', pageSize: '100' });
  const response = await page.request.get(`${apiBaseUrl}/staff/bookings?${query.toString()}`, {
    headers,
  });
  if (!response.ok()) {
    throw new Error(`Fixture booking lookup failed with HTTP ${response.status()}.`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error('Fixture booking lookup returned an invalid response.');
  }

  return payload.items.flatMap((item): string[] => {
    if (
      !isRecord(item) ||
      item.guestPhone !== guestPhone ||
      typeof item.reference !== 'string' ||
      !item.reference.trim()
    ) {
      return [];
    }
    return [item.reference.trim()];
  });
}

async function cleanBookingByReference(
  page: Page,
  headers: Record<string, string>,
  reference: string,
  guestPhone: string,
): Promise<void> {
  const detailResponse = await page.request.get(
    `${apiBaseUrl}/staff/bookings/${encodeURIComponent(reference)}`,
    { headers },
  );
  if (!detailResponse.ok()) {
    throw new Error(`Fixture booking detail lookup failed with HTTP ${detailResponse.status()}.`);
  }

  const booking: unknown = await detailResponse.json();
  if (!isRecord(booking) || booking.reference !== reference || booking.guestPhone !== guestPhone) {
    throw new Error('Fixture booking detail did not match its unique test phone.');
  }

  let action: 'reject' | 'cancel' | undefined;
  let expectedStatus: string | undefined;
  let data: Record<string, string> | undefined;
  if (booking.status === 'PENDING_CONFIRMATION') {
    action = 'reject';
    expectedStatus = 'REJECTED';
    data = { internalNote: 'HBE-020 fictional browser fixture cleanup.' };
  } else if (booking.status === 'CONFIRMED') {
    action = 'cancel';
    expectedStatus = 'CANCELLED';
    data = { reason: 'HBE-020 fictional browser fixture cleanup.' };
  } else if (
    booking.status === 'REJECTED' ||
    booking.status === 'CANCELLED' ||
    booking.status === 'EXPIRED'
  ) {
    return;
  } else {
    throw new Error('Fixture booking returned an unsupported status during cleanup.');
  }

  const transition = await page.request.post(
    `${apiBaseUrl}/staff/bookings/${encodeURIComponent(reference)}/${action}`,
    { headers, data },
  );
  if (!transition.ok()) {
    throw new Error(`Fixture booking ${action} failed with HTTP ${transition.status()}.`);
  }

  const result: unknown = await transition.json();
  if (!isRecord(result) || result.reference !== reference || result.status !== expectedStatus) {
    throw new Error(`Fixture booking ${action} did not return the expected terminal state.`);
  }
}

export async function withStaffBookingCleanup<T>(
  page: Page,
  guestPhone: string,
  fallbackCookies: StaffBrowserCookie[],
  scenario: (bookingCreated: BookingCreated) => Promise<T>,
): Promise<T> {
  return withFailureSafeCleanup(async (registerCleanup) => {
    let created = false;
    let reference: string | undefined;

    registerCleanup(async () => {
      if (!created) return;

      const headers = await staffHeaders(page, fallbackCookies);
      const references = reference
        ? [reference]
        : await findFixtureBookingReferences(page, headers, guestPhone);
      if (references.length === 0) return;
      for (const foundReference of references) {
        await cleanBookingByReference(page, headers, foundReference, guestPhone);
      }
    });

    return scenario((foundReference) => {
      created = true;
      if (foundReference && /^[A-Za-z0-9_-]{12,16}$/.test(foundReference.trim())) {
        reference = foundReference.trim();
      }
    });
  });
}

async function findWalkInFixtureReferences(
  page: Page,
  headers: Record<string, string>,
  guestPhone: string,
): Promise<string[]> {
  const query = new URLSearchParams({ search: guestPhone, page: '1', pageSize: '100' });
  const response = await page.request.get(`${apiBaseUrl}/staff/bookings?${query.toString()}`, {
    headers,
  });
  if (!response.ok()) {
    throw new Error(`Walk-in fixture lookup failed with HTTP ${response.status()}.`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error('Walk-in fixture lookup returned an invalid response.');
  }

  const matches: string[] = [];
  for (const item of payload.items) {
    if (!isRecord(item) || item.guestPhone !== guestPhone) continue;
    if (
      item.guestName !== 'مهمان آزمایشی پذیرش' ||
      item.status !== 'CONFIRMED' ||
      typeof item.reference !== 'string' ||
      !/^[A-Za-z0-9_-]{12,16}$/.test(item.reference)
    ) {
      throw new Error('Walk-in fixture lookup found a booking that failed its exact-match guard.');
    }
    matches.push(item.reference);
  }

  if (matches.length > 1) {
    throw new Error('Walk-in fixture lookup found multiple exact-phone bookings.');
  }
  return matches;
}

function cleanupWalkInFixture(reference: string, guestPhone: string): void {
  if (!/^[A-Za-z0-9_-]{12,16}$/.test(reference) || !/^\+98915\d{7}$/.test(guestPhone)) {
    throw new Error('Walk-in fixture cleanup refused an invalid reference or test phone.');
  }
  const workspaceRoot = resolve(process.cwd(), '../..');
  const databaseUrl =
    process.env.HBE_E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    getE2eDatabaseUrl(workspaceRoot);
  try {
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/, ''));
    if (!databaseName.endsWith('_test')) throw new Error('not a test database');
  } catch {
    throw new Error('Walk-in fixture cleanup requires an isolated _test database.');
  }
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  try {
    execFileSync(
      pnpm,
      [
        '--filter',
        '@hotel/api',
        'exec',
        'tsx',
        'test/cleanup-walk-in-fixture.cli.ts',
        reference,
        guestPhone,
      ],
      {
        cwd: workspaceRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl, HBE_E2E_DATABASE_URL: databaseUrl },
        encoding: 'utf8',
        shell: process.platform === 'win32',
        stdio: 'pipe',
      },
    );
  } catch (cause) {
    const exitCode =
      typeof cause === 'object' && cause !== null && 'status' in cause
        ? String(cause.status)
        : 'unknown';
    throw new Error(`Walk-in fixture cleanup CLI failed with exit code ${exitCode}.`, {
      cause,
    });
  }
}

export async function withStaffWalkInCleanup<T>(
  page: Page,
  guestPhone: string,
  fallbackCookies: StaffBrowserCookie[],
  scenario: (bookingCreated: BookingCreated) => Promise<T>,
): Promise<T> {
  return withFailureSafeCleanup(async (registerCleanup) => {
    let created = false;
    let reference: string | undefined;

    registerCleanup(async () => {
      if (!created) return;

      const headers = await staffHeaders(page, fallbackCookies);
      const references = reference
        ? [reference]
        : await findWalkInFixtureReferences(page, headers, guestPhone);
      if (references.length === 0) return;
      if (references.length !== 1) {
        throw new Error('Walk-in fixture cleanup requires exactly one reference.');
      }
      cleanupWalkInFixture(references[0], guestPhone);
    });

    return scenario((foundReference) => {
      created = true;
      if (foundReference !== undefined) {
        if (!/^[A-Za-z0-9_-]{12,16}$/.test(foundReference.trim())) {
          throw new Error('Walk-in fixture returned an invalid reference for cleanup.');
        }
        reference = foundReference.trim();
      }
    });
  });
}
