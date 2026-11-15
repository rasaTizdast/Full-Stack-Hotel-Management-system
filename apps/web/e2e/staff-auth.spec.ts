import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test } from './staff-fixtures';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const webPort = process.env.HBE_E2E_WEB_PORT ?? '3015';
const webOrigin = `http://localhost:${webPort}`;
const apiBaseUrl = `http://localhost:${apiPort}/api/v1`;

function localEnvValue(name: string): string | undefined {
  const envPath = resolve(process.cwd(), '../../.env');
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trimStart().startsWith(`${name}=`));
  return line
    ?.slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function demoCredentials() {
  const email = process.env.DEMO_ADMIN_EMAIL ?? localEnvValue('DEMO_ADMIN_EMAIL');
  const password = process.env.DEMO_ADMIN_PASSWORD ?? localEnvValue('DEMO_ADMIN_PASSWORD');
  if (!email || !password) {
    throw new Error('Set fictional DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD in the local .env.');
  }
  return { email, password };
}

async function signIn(page: import('@playwright/test').Page) {
  const credentials = demoCredentials();
  await page.goto('/staff/login');
  await page.getByLabel('ایمیل کاری').fill(credentials.email);
  await page.getByLabel('گذرواژه').fill(credentials.password);
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await expect(page.getByRole('navigation', { name: 'منوی پنل کارکنان' })).toBeVisible();
}

test('keeps signed-out staff routes private and the API denies direct calls', async ({
  page,
  request,
}) => {
  const directResponse = await request.put(`${apiBaseUrl}/staff/inventory`, {
    data: { roomTypeId: '00000000-0000-4000-8000-000000000000' },
  });
  expect(directResponse.status()).toBe(401);

  const rawStaffPage = await request.get(`${webOrigin}/staff`);
  expect(rawStaffPage.ok()).toBe(true);
  expect(await rawStaffPage.text()).not.toContain('روز بخیر');

  await page.goto('/staff');
  await expect(page).toHaveURL(/\/staff\/login$/);
  await expect(page.getByRole('heading', { name: 'به پنل خوش آمدید' })).toBeVisible();
  await expect(page.getByText('اطلاعات خصوصی رزرو')).toHaveCount(0);
});

test('allows staff to sign in and log out with the server session', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('link', { name: 'ظرفیت و نرخ‌ها', exact: true })).toBeVisible();

  const sessionCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'hotel_staff_session',
  );
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.path).toBe('/api/v1/staff');
  expect(sessionCookie?.value).not.toBe('');

  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  expect(storage.local).toEqual([]);
  expect(storage.session).toEqual([]);

  await page.route(`${apiBaseUrl}/staff/auth/me`, async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    await route.fulfill({
      response,
      json: { ...session, staff: { ...session.staff, role: 'RECEPTIONIST' } },
    });
  });
  await page.reload();
  await expect(page.getByRole('link', { name: 'درخواست‌های رزرو' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ظرفیت و نرخ‌ها', exact: true })).toHaveCount(0);
  await expect(page.getByText('پذیرش', { exact: true })).toBeVisible();

  await page.unroute(`${apiBaseUrl}/staff/auth/me`);
  await page.reload();
  await expect(page.getByRole('link', { name: 'ظرفیت و نرخ‌ها', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'خروج از پنل' }).click();
  await expect(page).toHaveURL(/\/staff\/login$/);
  expect(
    (await page.context().cookies()).some((cookie) => cookie.name === 'hotel_staff_session'),
  ).toBe(false);
});

test('returns to sign-in after the current-user endpoint reports an expired session', async ({
  page,
  staffCookies,
}) => {
  await page.context().addCookies(staffCookies);
  await page.route(`${apiBaseUrl}/staff/auth/me`, (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 401, message: 'Authentication is required.' }),
    }),
  );

  await page.goto('/staff');
  await expect(page).toHaveURL(/\/staff\/login$/);
  await expect(page.getByRole('heading', { name: 'به پنل خوش آمدید' })).toBeVisible();
});

test('keeps sign-in keyboard-operable and clear of WCAG A/AA axe violations', async ({ page }) => {
  await page.goto('/staff/login');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'بازگشت به وب‌سایت' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('ایمیل کاری')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('گذرواژه')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'ورود به پنل' })).toBeFocused();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
