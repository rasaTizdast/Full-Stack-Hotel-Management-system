import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';
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

function safeHostPath(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return '(invalid-url)';
  }
}

function safeNetworkFailure(errorText: string): string {
  return errorText.replace(/https?:\/\/[^\s]+/g, (rawUrl) => safeHostPath(rawUrl));
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
 * Creates a real role account using the authenticated administrator, changes
 * its forced initial password through the staff UI, then registers exact
 * deactivation cleanup. Staff rows are deactivated rather than deleted so
 * their audit history and actor references remain intact.
 */
export async function createHousekeepingStaffSession(
  administratorPage: Page,
  browser: Browser,
  role: HousekeepingStaffRole,
  registerCleanup: CleanupRegistrar,
): Promise<HousekeepingStaffSession> {
  const runPart = randomUUID().slice(0, 8);
  const username = `hpm005-${role.toLowerCase()}-${runPart}`;
  const email = `${username}@example.test`;
  const initialPassword = `Hpm005!${randomUUID()}aA1`;
  const replacementPassword = `Hpm005!${randomUUID()}zZ2`;

  const createResponse = await administratorPage.request.post(
    `${housekeepingApiBaseUrl}/staff/admin/accounts`,
    {
      headers: await administratorHeaders(administratorPage),
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
        data: { reason: 'HPM-005 E2E generated role-account cleanup.' },
      },
    );
    if (response.status() !== 200) {
      throw new Error(`Housekeeping role-account cleanup failed with HTTP ${response.status()}.`);
    }
  });

  const viewport = administratorPage.viewportSize();
  const mobile = Boolean(viewport && viewport.width <= 600);
  const accountContext = await browser.newContext({
    baseURL: housekeepingWebOrigin,
    ...(viewport ? { viewport } : {}),
    isMobile: mobile,
    hasTouch: mobile,
    ...(mobile ? { deviceScaleFactor: 2 } : {}),
  });
  registerCleanup(async () => accountContext.close());
  const accountPage = await accountContext.newPage();
  const authNetworkDiagnostics: string[] = [];
  accountPage.on('response', (response) => {
    const request = response.request();
    const method = request.method().toUpperCase();
    if (method !== 'POST' && method !== 'OPTIONS') return;
    const rawAllowOrigin = response.headers()['access-control-allow-origin'] ?? '(missing)';
    let allowOrigin = rawAllowOrigin.replace(/[\r\n]/g, '');
    if (allowOrigin.startsWith('http')) {
      try {
        allowOrigin = new URL(allowOrigin).origin;
      } catch {
        allowOrigin = '(invalid origin)';
      }
    }
    authNetworkDiagnostics.push(
      `${method} ${safeHostPath(request.url())} -> HTTP ${response.status()} ACAO=${allowOrigin}`,
    );
  });
  accountPage.on('requestfailed', (request) => {
    const method = request.method().toUpperCase();
    if (method !== 'POST' && method !== 'OPTIONS') return;
    const errorText = request.failure()?.errorText ?? '(unknown failure)';
    authNetworkDiagnostics.push(
      `${method} ${safeHostPath(request.url())} failed: ${safeNetworkFailure(errorText)}`,
    );
  });

  await accountPage.goto('/staff/login');
  await accountPage.getByLabel('ایمیل کاری').fill(email);
  await accountPage.getByLabel('گذرواژه').fill(initialPassword);
  await accountPage.getByRole('button', { name: 'ورود به پنل' }).click();
  try {
    await expect(accountPage).toHaveURL(/\/staff\/change-password$/, { timeout: 30_000 });
    await expect(accountPage.getByRole('heading', { name: 'تغییر گذرواژه' })).toBeVisible({ timeout: 30_000 });
  } catch {
    const currentPage = safeHostPath(accountPage.url());
    const diagnosticLines = authNetworkDiagnostics.length
      ? authNetworkDiagnostics.join('\n')
      : '(no POST/OPTIONS response or request-failure events observed)';
    throw new Error(
      `Forced-password login did not reach the change-password page. Current page: ${currentPage}\n` +
        `Safe auth network diagnostics:\n${diagnosticLines}`,
    );
  }
  await accountPage.getByLabel('گذرواژه فعلی').fill(initialPassword);
  await accountPage.getByLabel('گذرواژه تازه', { exact: true }).fill(replacementPassword);
  await accountPage.getByLabel('تکرار گذرواژه تازه').fill(replacementPassword);
  await accountPage.getByRole('button', { name: 'تغییر گذرواژه' }).click();
  const expectedHomePath = getStaffHomePath(role);
  try {
    // The role home route proves the change-password route was left and the
    // refreshed session reached its expected workspace.
    await expect(accountPage).toHaveURL(
      (url) => url.pathname === expectedHomePath || url.pathname === `${expectedHomePath}/`,
      { timeout: 30_000 },
    );
  } catch {
    const currentPage = safeHostPath(accountPage.url());
    const responseDiagnostics = authNetworkDiagnostics.filter((line) => line.includes(' -> HTTP '));
    const diagnosticLines = responseDiagnostics.length
      ? responseDiagnostics.join('\n')
      : '(no POST/OPTIONS response events observed)';
    throw new Error(
      `Forced-password change did not reach the expected ${role} workspace (${expectedHomePath}). Current page: ${currentPage}\n` +
        `Safe auth response diagnostics:\n${diagnosticLines}`,
    );
  }

  const sessionResponse = await accountPage.request.get(
    `${housekeepingApiBaseUrl}/staff/auth/me`,
    { headers: { Origin: housekeepingWebOrigin, Referer: `${housekeepingWebOrigin}/staff` } },
  );
  expect(sessionResponse.status()).toBe(200);
  const session: unknown = await sessionResponse.json();
  if (!isRecord(session) || !isRecord(session.staff)) {
    throw new Error('The housekeeping role-account session response was invalid.');
  }
  expect(session.staff.role).toBe(role);
  expect(session.staff.mustChangePassword).toBe(false);

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
