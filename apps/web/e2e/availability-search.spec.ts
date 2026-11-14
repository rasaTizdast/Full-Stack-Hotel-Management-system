import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
}

test('guests search Persian dates and see API-priced available rooms', async ({ page }) => {
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
  await page.getByRole('button', { name: 'بررسی اتاق‌های موجود' }).click();

  await expect(page.getByRole('heading', { name: 'اتاق‌های مناسب شما' })).toBeVisible();
  const firstRoom = page.locator('.availability-card').first();
  await expect(firstRoom).toBeVisible();
  await expect(firstRoom).toContainText('حداکثر');
  await expect(firstRoom).toContainText('تومان');
  await expect(firstRoom).toContainText('اتاق در دسترس');

  expect(availabilityRequests).toHaveLength(1);
  expect(availabilityRequests[0].pathname).toBe('/api/availability');
  expect(availabilityRequests[0].searchParams.get('checkIn')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(availabilityRequests[0].searchParams.get('checkOut')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(availabilityRequests[0].searchParams.get('guests')).toBe('2');
  await expectNoHorizontalOverflow(page);
});
