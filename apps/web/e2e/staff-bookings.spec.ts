import { randomInt, randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isAvailabilityResult } from '../src/lib/availability';
import { test, withStaffBookingCleanup } from './staff-fixtures';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4016';
const apiBaseUrl = `http://localhost:${apiPort}/api/v1`;

test.beforeEach(async ({ page, staffCookies }) => {
  await page.context().addCookies(staffCookies);
});

function addUtcDays(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addStayDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function titleHash(title: string): number {
  return [...title].reduce((sum, character) => sum + character.charCodeAt(0), 0);
}

async function createPendingBooking(
  request: APIRequestContext,
  testInfo: TestInfo,
  guestPhone: string,
  markBookingCreated: (reference?: string) => void,
): Promise<string> {
  const start =
    3 + ((titleHash(testInfo.title) + (testInfo.project.name === 'mobile-chrome' ? 29 : 0)) % 65);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const checkIn = addUtcDays(start + attempt);
    const checkOut = addStayDays(checkIn, 2);
    const query = new URLSearchParams({ checkIn, checkOut, guests: '2' });
    const availability = await request.get(`${apiBaseUrl}/availability?${query}`);
    if (!availability.ok()) {
      throw new Error(`Booking setup availability failed with ${availability.status()}.`);
    }
    const result: unknown = await availability.json();
    if (!isAvailabilityResult(result))
      throw new Error('Booking setup returned invalid availability data.');

    const room = result.roomTypes.find((item) => item.slug === 'garden-double');
    if (!room?.isAvailable || room.availableRooms < 1) continue;

    markBookingCreated();
    const response = await request.post(`${apiBaseUrl}/bookings`, {
      headers: { 'Idempotency-Key': randomUUID() },
      data: {
        roomTypeSlug: 'garden-double',
        checkIn,
        checkOut,
        guestCount: 2,
        roomQuantity: 1,
        guestName: `آزمون ${testInfo.title.slice(0, 35)}`,
        guestPhone,
        guestEmail: 'staff-bookings@example.test',
      },
    });
    const payload: unknown = await response.json().catch(() => undefined);
    const reference =
      typeof payload === 'object' &&
      payload !== null &&
      'reference' in payload &&
      typeof payload.reference === 'string' &&
      /^[A-Za-z0-9_-]{12,16}$/.test(payload.reference.trim())
        ? payload.reference.trim()
        : undefined;
    if (response.status() === 201) markBookingCreated(reference);
    expect(response.status()).toBe(201);
    if (!reference) throw new Error('Booking setup response did not include a reference.');
    return reference;
  }

  throw new Error('No future garden room was available for the staff browser test.');
}

function uniqueStaffGuestPhone(): string {
  return `+98915${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
}

async function openBookings(page: Page) {
  await page.goto('/staff/bookings');
  await expect(page.getByRole('navigation', { name: 'منوی پنل کارکنان' })).toBeVisible();
}

async function findBooking(page: Page, reference: string) {
  await expect(page.getByRole('heading', { name: 'درخواست‌های اقامت' })).toBeVisible();
  await page.getByLabel('کد رزرو یا موبایل').fill(reference);
  await page.getByRole('button', { name: 'اعمال فیلترها' }).click();
  const booking = page.getByRole('button', {
    name: new RegExp(`نمایش جزئیات رزرو ${reference}`),
  });
  await expect(booking).toBeVisible();
  await booking.click();
  await expect(page.getByRole('heading', { name: `جزئیات رزرو ${reference}` })).toBeVisible();
}

async function expectAxeClean(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

test('staff filters a pending request, inspects details, and confirms it from the server', async ({
  page,
  request,
  staffCookies,
}, testInfo) => {
  const guestPhone = uniqueStaffGuestPhone();
  await withStaffBookingCleanup(page, guestPhone, staffCookies, async (markBookingCreated) => {
    const reference = await createPendingBooking(request, testInfo, guestPhone, markBookingCreated);
    await openBookings(page);
    await findBooking(page, reference);
    await expect(page.getByText('اطلاعات مهمان')).toBeVisible();
    await expectAxeClean(page);

    await page.getByRole('button', { name: 'تأیید رزرو' }).click();
    await expect(page.getByRole('heading', { name: 'تأیید نهایی رزرو' })).toBeFocused();
    await page.getByLabel('یادداشت داخلی (اختیاری)').fill('موجودی بررسی شد.');
    await expectAxeClean(page);
    await page.getByRole('button', { name: 'بله، رزرو را تأیید می‌کنم' }).click();

    await expect(page.getByText('رزرو تأیید شد.')).toBeVisible();
    await expect(page.getByText('تأییدشده', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('موجودی بررسی شد.')).toBeVisible();
  });
});

test('staff rejects a request only after reviewing a final confirmation', async ({
  page,
  request,
  staffCookies,
}, testInfo) => {
  const guestPhone = uniqueStaffGuestPhone();
  await withStaffBookingCleanup(page, guestPhone, staffCookies, async (markBookingCreated) => {
    const reference = await createPendingBooking(request, testInfo, guestPhone, markBookingCreated);
    await openBookings(page);
    await findBooking(page, reference);
    await page.getByRole('button', { name: 'رد درخواست' }).click();
    await expect(page.getByRole('heading', { name: 'ثبت رد رزرو' })).toBeFocused();
    await page.getByLabel('یادداشت داخلی (اختیاری)').fill('مهمان زمان دیگری انتخاب کرد.');
    await page.getByRole('button', { name: 'بله، درخواست را رد می‌کنم' }).click();

    await expect(page.getByText('درخواست رزرو رد شد.')).toBeVisible();
    await expect(page.getByText('ردشده', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('مهمان زمان دیگری انتخاب کرد.')).toBeVisible();
  });
});

test('staff cancels a confirmed booking with a required reason', async ({
  page,
  request,
  staffCookies,
}, testInfo) => {
  const guestPhone = uniqueStaffGuestPhone();
  await withStaffBookingCleanup(page, guestPhone, staffCookies, async (markBookingCreated) => {
    const reference = await createPendingBooking(request, testInfo, guestPhone, markBookingCreated);
    await openBookings(page);
    await findBooking(page, reference);

    await page.getByRole('button', { name: 'تأیید رزرو' }).click();
    await page.getByRole('button', { name: 'بله، رزرو را تأیید می‌کنم' }).click();
    await expect(page.getByRole('button', { name: 'لغو رزرو' })).toBeVisible();
    await page.getByRole('button', { name: 'لغو رزرو' }).click();
    const cancel = page.getByRole('button', { name: 'بله، رزرو را لغو می‌کنم' });
    await cancel.click();
    expect(
      await page
        .getByLabel('دلیل لغو')
        .evaluate((element) => (element as HTMLTextAreaElement).validity.valid),
    ).toBe(false);
    await page.getByLabel('دلیل لغو').fill('لغو به درخواست مهمان');
    await cancel.click();

    await expect(page.getByText('رزرو لغو شد.')).toBeVisible();
    await expect(page.getByText('لغوشده', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('لغو به درخواست مهمان')).toBeVisible();
  });
});

test('staff sees a clear server error and can retry the booking list', async ({ page }) => {
  let interceptedListRequest = false;
  let shouldFailListRequest = true;
  await page.route(
    (url) => url.pathname === '/api/v1/staff/bookings',
    async (route) => {
      interceptedListRequest = true;
      if (shouldFailListRequest) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ statusCode: 503, message: 'فهرست رزروها موقتاً در دسترس نیست.' }),
        });
      } else {
        await route.continue();
      }
    },
  );
  await openBookings(page);
  await expect.poll(() => interceptedListRequest).toBe(true);

  const serverError = page
    .getByRole('alert')
    .filter({ hasText: 'فهرست رزروها موقتاً در دسترس نیست.' });
  await expect(serverError).toHaveText('فهرست رزروها موقتاً در دسترس نیست.');
  shouldFailListRequest = false;
  await page.getByRole('button', { name: 'تلاش دوباره' }).click();
  await expect(page.getByRole('heading', { name: 'فهرست رزروها' })).toBeVisible();
  await expect(serverError).toHaveCount(0);
  await expectAxeClean(page);

  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});
