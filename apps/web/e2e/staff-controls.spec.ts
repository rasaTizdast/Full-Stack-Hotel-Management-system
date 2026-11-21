import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, withFailureSafeCleanup } from './staff-fixtures';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const webOrigin = `http://127.0.0.1:${process.env.HBE_E2E_WEB_PORT ?? '3015'}`;
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  expect(results.violations).toEqual([]);
}

async function adminHeaders(page: Page) {
  const cookies = await page.context().cookies(`${apiBaseUrl}/staff`);
  const session = cookies.find((cookie) => cookie.name === 'hotel_staff_session')?.value;
  const csrf = cookies.find((cookie) => cookie.name === 'hotel_staff_csrf')?.value;
  if (!session || !csrf) throw new Error('The administrator session was unavailable for cleanup.');
  return {
    Cookie: `hotel_staff_session=${session}; hotel_staff_csrf=${csrf}`,
    Origin: webOrigin,
    Referer: `${webOrigin}/staff/staff`,
    'X-CSRF-Token': csrf,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test.beforeEach(async ({ page, staffCookies }) => {
  await page.context().addCookies(staffCookies);
});

test('admin creates and manages an account with forced password replacement', async ({
  page,
  browser,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const username = `e2e-staff-${suffix}@example.test`;
  const email = username;
  const initialPassword = `E2e!${randomUUID()}aA1`;
  const replacementPassword = `Replaced!${randomUUID()}zZ2`;
  let accountId: string | undefined;
  let accountIsActive = false;

  await withFailureSafeCleanup(async (registerCleanup) => {
    registerCleanup(async () => {
      if (!accountId || !accountIsActive) return;
      const headers = await adminHeaders(page);
      const response = await page.request.post(
        `${apiBaseUrl}/staff/admin/accounts/${encodeURIComponent(accountId)}/deactivate`,
        { headers, data: { reason: 'E2E account cleanup.' } },
      );
      if (!response.ok()) {
        throw new Error(`Staff account fixture cleanup failed with HTTP ${response.status()}.`);
      }
    });

    await page.goto('/staff/staff');
    await expect(page.getByRole('heading', { level: 1, name: 'مدیریت کارکنان' })).toBeVisible();
    await expect(page.locator('.staff-accounts__table')).toBeAttached();
    const accountCards = page.getByRole('list', { name: 'فهرست حساب‌های کارکنان' });
    const accountTable = page.locator('.staff-accounts__table');
    if (testInfo.project.name === 'mobile-chrome') {
      await expect(accountCards).toBeVisible();
      await expect(accountTable).toBeHidden();
    } else {
      await expect(page.getByRole('table')).toBeVisible();
      await expect(accountCards).toBeHidden();
    }
    const accountEntry = (accountUsername: string) =>
      testInfo.project.name === 'mobile-chrome'
        ? accountCards.getByRole('listitem').filter({ hasText: accountUsername })
        : page.getByRole('row', { name: new RegExp(accountUsername) });
    const addAccountButton = page.getByRole('button', { name: 'افزودن حساب' });
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBe(false);
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
    await addAccountButton.click();
    await expect(page.getByRole('button', { name: 'بستن فرم' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expectNoA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath('staff-accounts.png'), fullPage: true });
    await page.getByLabel('نام کاربری').fill(username);
    await page.getByLabel('ایمیل کاری').fill(email);
    await page.getByLabel('گذرواژه آغازین').fill(initialPassword);
    await page.getByRole('combobox', { name: 'نقش', exact: true }).selectOption('RECEPTIONIST');

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/staff/admin/accounts' && response.request().method() === 'POST';
    });
    await page.getByRole('button', { name: 'ایجاد حساب' }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created: unknown = await createResponse.json();
    if (!isRecord(created) || typeof created.id !== 'string') {
      throw new Error('Staff account creation did not return an account ID.');
    }
    accountId = created.id;
    accountIsActive = true;
    await expect(page.getByRole('status')).toContainText(`حساب ${username} ایجاد شد.`);
    await expect(page.getByLabel('گذرواژه آغازین')).toHaveValue('');
    await expect(page.getByText(initialPassword, { exact: false })).toHaveCount(0);

    const initialRow = accountEntry(username);
    await expect(initialRow).toContainText(/[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}، [۰-۹]{2}:[۰-۹]{2}/);
    await expect(initialRow.getByRole('link')).toHaveCount(0);
    await expect(initialRow).toContainText('پذیرش');
    await expect(initialRow).toContainText('فعال');
    await expect(initialRow).toContainText('گذرواژه آغازین تغییر نشده');
    await initialRow.getByRole('button', { name: 'تغییر نقش' }).click();
    const roleForm = page.getByRole('form', { name: `تغییر نقش حساب ${username}` });
    await roleForm.getByLabel('نقش تازه').selectOption('MANAGER');
    await roleForm.getByLabel('دلیل تغییر نقش').fill('Shift management responsibilities.');
    const roleResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith(`/staff/admin/accounts/${accountId}/role`) && response.request().method() === 'PATCH';
    });
    await roleForm.getByRole('button', { name: 'ذخیره نقش' }).click();
    expect((await roleResponsePromise).status()).toBe(200);
    await expect(page.getByRole('status')).toContainText(`نقش ${username} تغییر کرد.`);
    await expect(accountEntry(username)).toContainText('مدیر شیفت');

    const credentialContext = await browser.newContext();
    const credentialPage = await credentialContext.newPage();
    try {
      await credentialPage.goto(`${webOrigin}/staff/login`);
      await credentialPage.getByLabel('ایمیل کاری').fill(email);
      await credentialPage.getByLabel('گذرواژه').fill(initialPassword);
      await credentialPage.getByRole('button', { name: 'ورود به پنل' }).click();
      await expect(credentialPage).toHaveURL(/\/staff\/change-password$/, { timeout: 30_000 });
      await expect(credentialPage.getByRole('heading', { name: 'تغییر گذرواژه' })).toBeVisible();
      await expectNoA11yViolations(credentialPage);
      await credentialPage.screenshot({
        path: testInfo.outputPath('staff-change-password.png'),
        fullPage: true,
      });
      await credentialPage.getByLabel('گذرواژه فعلی').fill(initialPassword);
      await credentialPage.getByLabel('گذرواژه تازه', { exact: true }).fill(replacementPassword);
      await credentialPage.getByLabel('تکرار گذرواژه تازه').fill(replacementPassword);
      await credentialPage.getByRole('button', { name: 'تغییر گذرواژه' }).click();
      await expect(credentialPage).toHaveURL(/\/staff\/front-desk\/arrivals$/, { timeout: 30_000 });

      const updatedRow = accountEntry(username);
      await updatedRow.getByRole('button', { name: 'غیرفعال‌سازی' }).click();
      const deactivateForm = page.getByRole('form', { name: `غیرفعال‌سازی حساب ${username}` });
      await deactivateForm.getByLabel('دلیل غیرفعال‌سازی').fill('Account closure in E2E cleanup.');
      const deactivateResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith(`/staff/admin/accounts/${accountId}/deactivate`) && response.request().method() === 'POST';
      });
      await deactivateForm.getByRole('button', { name: 'تأیید غیرفعال‌سازی' }).click();
      expect((await deactivateResponsePromise).status()).toBe(200);
      accountIsActive = false;
      await expect(page.getByRole('status')).toContainText(`حساب ${username} غیرفعال شد.`);

      const revokedSession = await credentialContext.request.get(`${apiBaseUrl}/staff/auth/me`, {
        headers: { Origin: webOrigin, Referer: `${webOrigin}/staff` },
      });
      expect(revokedSession.status()).toBe(401);
    } finally {
      await credentialContext.close();
    }
  });
});
