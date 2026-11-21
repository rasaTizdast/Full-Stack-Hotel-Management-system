import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
}

test('guests can browse API-backed hotel and room information', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth');
  await expect(
    page.getByRole('heading', { level: 1, name: 'خانه‌باغ نارنج؛ هتل نمایشی' }),
  ).toBeVisible();
  const heroRoomLink = page
    .locator('#page-content')
    .getByRole('link', { name: 'دیدن اتاق‌ها', exact: true });
  await expect(heroRoomLink).toBeVisible();
  await expect(page.getByRole('heading', { name: 'اتاق دوتخته باغ' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await heroRoomLink.click();
  await expect(page).toHaveURL(/\/rooms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'اتاق‌ها و سوئیت‌ها' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('link', { name: 'جزئیات اتاق دوتخته باغ', exact: true }).click();

  await expect(page).toHaveURL(/\/rooms\/garden-double$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'اتاق دوتخته باغ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'امکانات این اتاق', exact: true })).toBeVisible();

  await expectNoHorizontalOverflow(page);
});

test('unknown room slugs show a helpful not-found page', async ({ page }) => {
  await page.goto('/rooms/does-not-exist');
  await expect(page.getByRole('heading', { level: 1, name: 'این صفحه پیدا نشد' })).toBeVisible();
  await expect(page.getByRole('link', { name: /بازگشت به صفحهٔ اصلی/ })).toHaveAttribute(
    'href',
    '/',
  );
});
