import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { findAvailableGardenStay } from './available-stay';

async function expectNoHorizontalOverflow(page: Page) {
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
}

test('guests search Persian dates and see API-priced available rooms', async ({
  page,
  request,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const stay = await findAvailableGardenStay(request, testInfo);
  const availabilityRequests: URL[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/availability?')) {
      availabilityRequests.push(new URL(request.url()));
    }
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 2, name: 'قرارِ اقامتتان را پیدا کنید' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByLabel('تاریخ ورود').fill(stay.checkInJalali);
  await page.getByLabel('تاریخ خروج').fill(stay.checkOutJalali);
  const guestCount = page.getByLabel('تعداد مهمان');
  const searchButton = page.getByRole('button', { name: 'بررسی اتاق‌های موجود' });
  await page.getByLabel('تاریخ خروج').focus();
  await page.keyboard.press('Tab');
  await expect(guestCount).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(searchButton).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'اتاق‌های مناسب شما' })).toBeVisible();
  const results = page.locator('[aria-live="polite"]').filter({
    has: page.getByRole('heading', { name: 'اتاق‌های مناسب شما' }),
  });
  const gardenRoom = results.locator(
    `article:has(a[href="/rooms/${encodeURIComponent(stay.roomTypeSlug)}"])`,
  );
  await expect(gardenRoom).toBeVisible();
  await expect(gardenRoom).toContainText('حداکثر');
  await expect(gardenRoom).toContainText('تومان');
  await expect(gardenRoom).toContainText('اتاق در دسترس');

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  expect(availabilityRequests).toHaveLength(1);
  expect(availabilityRequests[0].pathname).toBe('/api/availability');
  expect(availabilityRequests[0].searchParams.get('checkIn')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(availabilityRequests[0].searchParams.get('checkOut')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(availabilityRequests[0].searchParams.get('guests')).toBe('2');
  await expectNoHorizontalOverflow(page);
});
