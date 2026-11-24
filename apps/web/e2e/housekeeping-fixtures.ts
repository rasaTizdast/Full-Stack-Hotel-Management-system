import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, request as playwrightRequest, type Browser, type Page } from '@playwright/test';
import { PrismaClient } from '../../api/src/generated/prisma/client';
import { getStaffHomePath } from '../src/lib/staff-navigation';
import type { CleanupRegistrar } from './staff-fixtures';
import { getE2eDatabaseUrl } from './test-database';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const webPort = process.env.HBE_E2E_WEB_PORT ?? '3015';
export const housekeepingApiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;
export const housekeepingWebOrigin = `http://127.0.0.1:${webPort}`;

export type HousekeepingStaffRole = 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER';

export interface HousekeepingStaffSession {
  accountId: string;
  email: string;
  username: string;
  role: HousekeepingStaffRole;
  page: Page;
}
export interface HousekeepingTaskRef {
  id: string;
  roomId: string;
  businessDate: string;
}

export interface HousekeepingDiscrepancyRef {
  id: string;
  roomId: string;
  businessDate: string;
}

interface HousekeepingLifecycleRecord {
  id: string;
  status: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface StaffAuthPayload {
  staff: {
    username: string;
    role: HousekeepingStaffRole;
    mustChangePassword: boolean;
  };
  csrfToken: string;
}

function isStaffAuthPayload(value: unknown): value is StaffAuthPayload {
  if (!isRecord(value) || !isRecord(value.staff)) return false;
  return (
    typeof value.staff.username === 'string' &&
    (value.staff.role === 'MANAGER' ||
      value.staff.role === 'RECEPTIONIST' ||
      value.staff.role === 'HOUSEKEEPER' ||
      value.staff.role === 'CASHIER') &&
    typeof value.staff.mustChangePassword === 'boolean' &&
    typeof value.csrfToken === 'string' &&
    value.csrfToken.length > 0
  );
}

export async function administratorHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies(`${housekeepingApiBaseUrl}/staff`);
  const session = cookies.find((cookie) => cookie.name === 'hotel_staff_session')?.value;
  const csrf = cookies.find((cookie) => cookie.name === 'hotel_staff_csrf')?.value;
  if (!session || !csrf) {
    throw new Error('The administrator session was unavailable for the housekeeping fixture.');
  }

  return {
    Cookie: `hotel_staff_session=${session}; hotel_staff_csrf=${csrf}`,
    Origin: housekeepingWebOrigin,
    Referer: `${housekeepingWebOrigin}/staff/staff`,
    'X-CSRF-Token': csrf,
  };
}

/**
 * Creates a real role account using the authenticated administrator, completes
 * the forced-password transition through the API, and transfers only its auth
 * cookies to a fresh browser context. The dedicated staff-controls E2E covers
 * password enrollment through the UI. Staff rows are deactivated rather than
 * deleted so their audit history and actor references remain intact.
 */
export async function createHousekeepingStaffSession(
  administratorPage: Page,
  browser: Browser,
  role: HousekeepingStaffRole,
  registerCleanup: CleanupRegistrar,
  runTag = 'HPM005',
): Promise<HousekeepingStaffSession> {
  const initialAdministratorHeaders = await administratorHeaders(administratorPage);
  const administratorSessionResponse = await administratorPage.request.get(
    `${housekeepingApiBaseUrl}/staff/auth/me`,
    { headers: initialAdministratorHeaders },
  );
  const administratorSession: unknown =
    administratorSessionResponse.status() === 200
      ? await administratorSessionResponse.json()
      : null;
  const administratorStaff =
    isRecord(administratorSession) && isRecord(administratorSession.staff)
      ? administratorSession.staff
      : null;
  const administratorRole =
    typeof administratorStaff?.role === 'string' ? administratorStaff.role : 'unknown';
  const administratorCsrf =
    isRecord(administratorSession) && typeof administratorSession.csrfToken === 'string'
      ? administratorSession.csrfToken
      : '';
  const administratorSessionContext =
    `Before creating the ${role} fixture, /auth/me returned HTTP ${administratorSessionResponse.status()}, ` +
    `role ${administratorRole}, mustChangePassword ${String(administratorStaff?.mustChangePassword)}.`;
  expect(administratorSessionResponse.status(), administratorSessionContext).toBe(200);
  expect(administratorRole, administratorSessionContext).toBe('ADMIN');
  expect(administratorStaff?.mustChangePassword, administratorSessionContext).toBe(false);
  const administratorHeadersForRequest = await administratorHeaders(administratorPage);
  expect(
    administratorHeadersForRequest['X-CSRF-Token'],
    `${administratorSessionContext} The page-context CSRF header did not match /auth/me.`,
  ).toBe(administratorCsrf);

  const runPart = randomUUID().slice(0, 8);
  const normalizedRunTag = runTag.toLowerCase();
  const passwordRunTag = runTag.toUpperCase();
  const username = `${normalizedRunTag}-${role.toLowerCase()}-${runPart}`;
  const email = `${username}@example.test`;
  const initialPassword = `${passwordRunTag}!${randomUUID()}aA1`;
  const replacementPassword = `${passwordRunTag}!${randomUUID()}zZ2`;

  const createResponse = await administratorPage.request.post(
    `${housekeepingApiBaseUrl}/staff/admin/accounts`,
    {
      headers: administratorHeadersForRequest,
      data: { username, email, initialPassword, role },
    },
  );
  expect(createResponse.status()).toBe(201);
  const created: unknown = await createResponse.json();
  if (
    !isRecord(created) ||
    typeof created.id !== 'string' ||
    created.username !== username ||
    created.email !== email ||
    created.role !== role ||
    created.isActive !== true ||
    created.mustChangePassword !== true
  ) {
    throw new Error('The housekeeping role-account fixture returned an invalid account.');
  }
  const accountId = created.id;
  registerCleanup(async () => {
    const response = await administratorPage.request.post(
      `${housekeepingApiBaseUrl}/staff/admin/accounts/${encodeURIComponent(accountId)}/deactivate`,
      {
        headers: await administratorHeaders(administratorPage),
        data: { reason: `${passwordRunTag} E2E generated role-account cleanup.` },
      },
    );
    if (response.status() !== 200) {
      throw new Error(`Housekeeping role-account cleanup failed with HTTP ${response.status()}.`);
    }
  });

  const viewport = administratorPage.viewportSize();
  const mobile = Boolean(viewport && viewport.width <= 600);
  const accountApi = await playwrightRequest.newContext({
    extraHTTPHeaders: {
      Origin: housekeepingWebOrigin,
      Referer: `${housekeepingWebOrigin}/staff/login`,
    },
  });
  let authCookies: Awaited<ReturnType<typeof accountApi.storageState>>['cookies'] = [];
  try {
    const loginResponse = await accountApi.post(`${housekeepingApiBaseUrl}/staff/auth/login`, {
      data: { email, password: initialPassword },
    });
    expect(loginResponse.status(), `The ${role} fixture login failed.`).toBe(200);
    const loginPayload: unknown = await loginResponse.json();
    if (
      !isStaffAuthPayload(loginPayload) ||
      loginPayload.staff.username !== username ||
      loginPayload.staff.role !== role ||
      loginPayload.staff.mustChangePassword !== true
    ) {
      throw new Error(`The ${role} fixture login did not require the initial password change.`);
    }

    const forcedSessionResponse = await accountApi.get(`${housekeepingApiBaseUrl}/staff/auth/me`, {
      headers: { Referer: `${housekeepingWebOrigin}/staff/change-password` },
    });
    expect(
      forcedSessionResponse.status(),
      `The ${role} forced-password session check failed.`,
    ).toBe(200);
    const forcedSession: unknown = await forcedSessionResponse.json();
    if (
      !isStaffAuthPayload(forcedSession) ||
      forcedSession.staff.username !== username ||
      forcedSession.staff.role !== role ||
      forcedSession.staff.mustChangePassword !== true
    ) {
      throw new Error(`The ${role} fixture did not retain its forced-password state.`);
    }

    const passwordChangeResponse = await accountApi.post(
      `${housekeepingApiBaseUrl}/staff/auth/change-password`,
      {
        headers: { 'X-CSRF-Token': forcedSession.csrfToken },
        data: { currentPassword: initialPassword, newPassword: replacementPassword },
      },
    );
    expect(passwordChangeResponse.status(), `The ${role} fixture password transition failed.`).toBe(
      204,
    );

    const activeSessionResponse = await accountApi.get(`${housekeepingApiBaseUrl}/staff/auth/me`, {
      headers: { Referer: `${housekeepingWebOrigin}/staff` },
    });
    expect(activeSessionResponse.status(), `The ${role} post-change session check failed.`).toBe(
      200,
    );
    const activeSession: unknown = await activeSessionResponse.json();
    if (
      !isStaffAuthPayload(activeSession) ||
      activeSession.staff.username !== username ||
      activeSession.staff.role !== role ||
      activeSession.staff.mustChangePassword !== false
    ) {
      throw new Error(`The ${role} fixture session was not active after password change.`);
    }

    authCookies = (await accountApi.storageState()).cookies.filter(
      (cookie) => cookie.name === 'hotel_staff_session' || cookie.name === 'hotel_staff_csrf',
    );
    const csrfCookie = authCookies.find((cookie) => cookie.name === 'hotel_staff_csrf');
    if (
      authCookies.length !== 2 ||
      !authCookies.some((cookie) => cookie.name === 'hotel_staff_session') ||
      !csrfCookie ||
      csrfCookie.value !== activeSession.csrfToken
    ) {
      throw new Error(`The ${role} fixture did not retain its exact authenticated staff cookies.`);
    }
  } finally {
    await accountApi.dispose();
  }

  const accountContext = await browser.newContext({
    baseURL: housekeepingWebOrigin,
    ...(viewport ? { viewport } : {}),
    isMobile: mobile,
    hasTouch: mobile,
    ...(mobile ? { deviceScaleFactor: 2 } : {}),
  });
  registerCleanup(async () => accountContext.close());
  await accountContext.addCookies(authCookies);
  const accountPage = await accountContext.newPage();
  const expectedHomePath = getStaffHomePath(role);
  await accountPage.goto(expectedHomePath);
  await expect(accountPage).toHaveURL(
    (url) => url.pathname === expectedHomePath || url.pathname === `${expectedHomePath}/`,
    { timeout: 30_000 },
  );
  const expectedHeading =
    role === 'HOUSEKEEPER'
      ? 'خانه‌داری'
      : role === 'CASHIER'
        ? 'فضای صندوق شما آماده است'
        : /^ورودهای/;
  await expect(accountPage.getByRole('heading', { name: expectedHeading })).toBeVisible({
    timeout: 30_000,
  });

  return { accountId, email, username, role, page: accountPage };
}

/**
 * Preserve completed/resolved records as test history. Only cancel exact
 * unfinished task IDs and reason-dismiss exact open discrepancy IDs created
 * by the current E2E run; never delete audit events or truncate tables.
 */
export async function cleanupUnfinishedHousekeepingRecords(
  administratorPage: Page,
  taskRefs: readonly HousekeepingTaskRef[],
  discrepancyRefs: readonly HousekeepingDiscrepancyRef[],
  runId: string,
  reworkParentTaskIds: readonly string[] = [],
): Promise<void> {
  const headers = await administratorHeaders(administratorPage);
  const exactTaskRefs = new Map(taskRefs.map((taskRef) => [taskRef.id, taskRef]));

  if (reworkParentTaskIds.length > 0) {
    const workspaceRoot = resolve(process.cwd(), '../..');
    const databaseUrl = getE2eDatabaseUrl(workspaceRoot);
    const apiRequire = createRequire(resolve(workspaceRoot, 'apps', 'api', 'package.json'));
    const { PrismaPg } = apiRequire('@prisma/adapter-pg') as {
      PrismaPg: new (options: { connectionString: string; max: number }) => unknown;
    };
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl, max: 1 }) as never,
    });
    try {
      for (const parentTaskId of new Set(reworkParentTaskIds)) {
        const child = await prisma.housekeepingTask.findUnique({
          where: { reworkOfTaskId: parentTaskId },
          select: { id: true, roomId: true, businessDate: true },
        });
        if (!child || exactTaskRefs.has(child.id)) continue;
        exactTaskRefs.set(child.id, {
          id: child.id,
          roomId: child.roomId,
          businessDate: child.businessDate.toISOString().slice(0, 10),
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  for (const taskRef of exactTaskRefs.values()) {
    const query = new URLSearchParams({
      businessDate: taskRef.businessDate,
      page: '1',
      pageSize: '100',
      roomId: taskRef.roomId,
    });
    const response = await administratorPage.request.get(
      `${housekeepingApiBaseUrl}/staff/housekeeping/tasks?${query.toString()}`,
      { headers },
    );
    expect(response.status()).toBe(200);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.items)) {
      throw new Error('Housekeeping task cleanup lookup returned an invalid list.');
    }
    const task = payload.items.find(
      (item): item is HousekeepingLifecycleRecord =>
        isRecord(item) && item.id === taskRef.id && typeof item.status === 'string',
    );
    if (!task) {
      throw new Error(`Housekeeping cleanup could not find generated task ${taskRef.id}.`);
    }
    if (task.status === 'OPEN' || task.status === 'IN_PROGRESS') {
      const cancelResponse = await administratorPage.request.post(
        `${housekeepingApiBaseUrl}/staff/housekeeping/tasks/${encodeURIComponent(task.id)}/cancel`,
        {
          headers,
          data: { reason: `HPM-005 E2E ${runId}: cleanup unfinished task.` },
        },
      );
      if (cancelResponse.status() !== 200) {
        throw new Error(
          `Housekeeping task cleanup failed with HTTP ${cancelResponse.status()} for ${task.id}.`,
        );
      }
      const cancelled: unknown = await cancelResponse.json();
      if (!isRecord(cancelled) || cancelled.status !== 'CANCELLED') {
        throw new Error(`Housekeeping task cleanup did not cancel ${task.id}.`);
      }
    } else if (task.status !== 'COMPLETED' && task.status !== 'CANCELLED') {
      throw new Error(`Housekeeping cleanup found unsupported state for task ${task.id}.`);
    }
  }

  for (const discrepancyRef of discrepancyRefs) {
    let discrepancy: HousekeepingLifecycleRecord | undefined;
    for (const status of ['OPEN', 'RESOLVED', 'DISMISSED'] as const) {
      const query = new URLSearchParams({
        businessDate: discrepancyRef.businessDate,
        page: '1',
        pageSize: '100',
        roomId: discrepancyRef.roomId,
        status,
      });
      const response = await administratorPage.request.get(
        `${housekeepingApiBaseUrl}/staff/housekeeping/discrepancies?${query.toString()}`,
        { headers },
      );
      expect(response.status()).toBe(200);
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.items)) {
        throw new Error('Housekeeping discrepancy cleanup lookup returned an invalid list.');
      }
      const matching = payload.items.find(
        (item): item is HousekeepingLifecycleRecord =>
          isRecord(item) && item.id === discrepancyRef.id && typeof item.status === 'string',
      );
      if (matching) {
        discrepancy = matching;
        break;
      }
    }
    if (!discrepancy) {
      throw new Error(
        `Housekeeping cleanup could not find generated discrepancy ${discrepancyRef.id}.`,
      );
    }
    if (discrepancy.status === 'OPEN') {
      const dismissResponse = await administratorPage.request.post(
        `${housekeepingApiBaseUrl}/staff/housekeeping/discrepancies/${encodeURIComponent(discrepancy.id)}/dismiss`,
        {
          headers,
          data: { reason: `HPM-005 E2E ${runId}: cleanup unresolved report.` },
        },
      );
      if (dismissResponse.status() !== 200) {
        throw new Error(
          `Housekeeping discrepancy cleanup failed with HTTP ${dismissResponse.status()} for ${discrepancy.id}.`,
        );
      }
      const dismissed: unknown = await dismissResponse.json();
      if (!isRecord(dismissed) || dismissed.status !== 'DISMISSED') {
        throw new Error(`Housekeeping discrepancy cleanup did not dismiss ${discrepancy.id}.`);
      }
    } else if (discrepancy.status !== 'RESOLVED' && discrepancy.status !== 'DISMISSED') {
      throw new Error(
        `Housekeeping cleanup found unsupported state for discrepancy ${discrepancy.id}.`,
      );
    }
  }
}
