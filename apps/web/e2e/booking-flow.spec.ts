import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { findAvailableGardenStay } from './available-stay';

async function expectAxeClean(page: Page) {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
}

async function beginBooking(page: Page, request: APIRequestContext, testInfo: TestInfo) {
  await page.goto('/');
  const stay = await findAvailableGardenStay(request, testInfo);
  await page.getByLabel('تاریخ ورود').fill(stay.checkInJalali);
  await page.getByLabel('تاریخ خروج').fill(stay.checkOutJalali);
  await page.getByRole('button', { name: 'بررسی اتاق‌های موجود' }).click();
  await expect(page.getByRole('heading', { name: 'اتاق‌های مناسب شما' })).toBeVisible();
  const bookingLink = page.getByRole('link', { name: 'درخواست اقامت' }).first();
  await expect(bookingLink).toBeVisible();
  const target = new URL((await bookingLink.getAttribute('href'))!, page.url());
  expect([...target.searchParams.keys()].sort()).toEqual([
    'checkIn',
    'checkOut',
    'guestCount',
    'roomType',
  ]);
  expect(target.search).not.toContain('guestName');
  expect(target.search).not.toContain('guestPhone');
  expect(target.search).not.toContain('totalPrice');
  await bookingLink.click();
  await expect(page.getByRole('heading', { name: 'درخواست اقامت' })).toBeVisible();
}

async function fillGuest(page: Page) {
  await page.getByLabel('نام و نام خانوادگی').fill('مریم رضایی');
  await page.getByLabel('شماره موبایل').fill('۰۹۱۲۳۴۵۶۷۸۹');
  await page.getByLabel('ایمیل (اختیاری)').fill('maryam@example.test');
}

test('guest submits a request and sees a safe pending confirmation', async ({
  page,
  request,
}, testInfo) => {
  let submitted: { headers: Record<string, string>; body: Record<string, unknown> } | undefined;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/bookings')) {
      submitted = {
        headers: request.headers(),
        body: request.postDataJSON() as Record<string, unknown>,
      };
    }
  });
  await beginBooking(page, request, testInfo);
  await expectAxeClean(page);
  await fillGuest(page);
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'ثبت درخواست اقامت' }).click();

  await expect(page.getByRole('heading', { name: 'درخواست اقامت شما ثبت شد' })).toBeVisible();
  await expect(page.getByText('در انتظار تأیید پذیرش')).toBeVisible();
  await expectAxeClean(page);
  await expect(page.getByText(/کد پیگیری/)).toBeVisible();
  await expect(page.getByText('مریم رضایی')).toHaveCount(0);
  await expect(page.getByLabel('شماره موبایل')).toHaveCount(0);
  expect(submitted?.headers['idempotency-key']).toMatch(/^[A-Za-z0-9._~-]{16,128}$/);
  expect(submitted?.body).toMatchObject({
    guestPhone: '+989123456789',
    guestEmail: 'maryam@example.test',
  });
  expect(submitted?.body).not.toHaveProperty('totalPriceToman');
  expect(new URL(page.url()).searchParams.has('guestPhone')).toBe(false);
});

test('availability change replaces submit with a fresh-search recovery action', async ({
  page,
  request,
}, testInfo) => {
  await page.route('**/api/bookings', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'AVAILABILITY_CHANGED' }),
    });
  });
  await beginBooking(page, request, testInfo);
  await fillGuest(page);
  await page.getByRole('button', { name: 'ثبت درخواست اقامت' }).click();

  await expect(page.locator('p[role="alert"]')).toContainText(
    'این اتاق دیگر برای تمام شب‌های انتخاب‌شده در دسترس نیست.',
  );
  await expectAxeClean(page);
  await expect(page.getByRole('link', { name: 'جستجوی دوباره' })).toHaveAttribute(
    'href',
    '/#stay-search',
  );
});
