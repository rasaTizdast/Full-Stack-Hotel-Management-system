import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test } from './staff-fixtures';

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  expect(results.violations).toEqual([]);
}

test('admin reviews a date-filtered report and closes an unblocked operating day', async ({
  page,
  staffCookies,
}, testInfo) => {
  await page.context().addCookies(staffCookies);

  await page.goto('/staff/reports');
  await expect(page.getByRole('heading', { name: 'گزارش روزانه' })).toBeVisible();
  await expect(page.getByLabel('تاریخ کاری')).toHaveValue(/[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/);
  await expect(page.getByText(/موجودی فعال اتاق‌ها/)).toBeVisible();
  await expectNoA11yViolations(page);
  await page.screenshot({ path: testInfo.outputPath('operations-report.png'), fullPage: true });

  await page.goto('/staff/operations/close');
  await expect(page.getByRole('heading', { name: 'بستن روز کاری' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تأیید و بستن روز' })).toBeEnabled({ timeout: 30_000 });
  await expectNoA11yViolations(page);
  await page.screenshot({ path: testInfo.outputPath('night-close-preview.png'), fullPage: true });

  await page.getByRole('button', { name: 'تأیید و بستن روز' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('هشدار باقی می‌ماند');
  await page.screenshot({ path: testInfo.outputPath('night-close-confirmation.png') });
  const closeResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/staff/operations/close' && response.request().method() === 'POST';
  });
  await dialog.getByRole('button', { name: 'تأیید بستن روز' }).click();
  const closeResponse = await closeResponsePromise;
  expect(closeResponse.status()).toBe(200);
  const closeResult: unknown = await closeResponse.json();
  expect(closeResult).toMatchObject({ status: 'COMPLETED', replayed: false });
  await expect(page.getByText('روز کاری با موفقیت بسته شد.')).toBeVisible();

  await page.goto('/staff/reports');
  await expect(page.getByRole('heading', { name: 'گزارش روزانه' })).toBeVisible();
  await expect(page.getByLabel('تاریخ کاری')).not.toHaveValue(
    (closeResult as { businessDate: string }).businessDate,
  );
});
