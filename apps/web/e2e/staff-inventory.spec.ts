import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test } from './staff-fixtures';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4016';
const apiBaseUrl = `http://localhost:${apiPort}/api/v1`;

test.beforeEach(async ({ page, staffCookies }) => {
  await page.context().addCookies(staffCookies);
});

test('admin can inspect and batch-save inventory, and the page meets axe checks', async ({
  page,
}) => {
  await page.goto('/staff/inventory');

  const table = page.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
  await expect(table).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'نوع اتاق' })).toHaveValue(/.+/);

  const capacity = page.getByLabel('ظرفیت کل اتاق‌ها');
  const originalCapacity = Number(await capacity.inputValue());
  expect(Number.isSafeInteger(originalCapacity)).toBe(true);
  await capacity.fill(String(originalCapacity + 1));
  await page.getByRole('button', { name: 'ذخیره برای همه شب‌ها' }).click();

  await expect(page.getByRole('status')).toContainText('شب ذخیره شد');
  await expect(capacity).toHaveValue(String(originalCapacity + 1));
  await expect(table.getByRole('row').nth(1).getByRole('cell').nth(0)).toHaveText(
    new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(originalCapacity + 1),
  );

  const results = await new AxeBuilder({ page })
    .include('.staff-inventory')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('receptionist does not see or request the admin inventory editor', async ({ page }) => {
  let roomTypeRequestCount = 0;
  await page.route(`${apiBaseUrl}/staff/auth/me`, async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    await route.fulfill({
      response,
      json: { ...session, staff: { ...session.staff, role: 'RECEPTIONIST' } },
    });
  });
  await page.route(`${apiBaseUrl}/staff/inventory/room-types`, (route) => {
    roomTypeRequestCount += 1;
    return route.continue();
  });

  await page.goto('/staff');
  await expect(page.getByRole('link', { name: 'ظرفیت و نرخ‌ها' })).toHaveCount(0);
  await page.goto('/staff/inventory');
  await expect(page.getByRole('heading', { name: 'دسترسی به مدیریت موجودی' })).toBeVisible();
  await expect(page.getByLabel('نوع اتاق')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ذخیره برای همه شب‌ها' })).toHaveCount(0);
  expect(roomTypeRequestCount).toBe(0);
});

test('inventory editor remains keyboard reachable on mobile', async ({ page }) => {
  await page.goto('/staff/inventory');
  await expect(page.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' })).toBeVisible();

  const focusedIds: string[] = [];
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press('Tab');
    focusedIds.push(await page.evaluate(() => (document.activeElement as HTMLElement).id));
  }

  expect(focusedIds).toContain('staff-inventory-room-type');
  expect(focusedIds).toContain('staff-inventory-start-date');
  expect(focusedIds).toContain('staff-inventory-end-date');
  expect(focusedIds).toContain('staff-inventory-capacity');
  expect(focusedIds).toContain('staff-inventory-nightly-price');
});
