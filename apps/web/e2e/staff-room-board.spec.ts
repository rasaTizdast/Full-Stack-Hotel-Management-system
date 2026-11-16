import { randomInt, randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import { isAvailabilityResult } from '../src/lib/availability';
import { formatGregorianAsJalali } from '../src/lib/jalali-date';
import { test, withStaffBookingCleanup } from './staff-fixtures';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const apiBaseUrl = `http://localhost:${apiPort}/api/v1`;

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

function uniqueGuestPhone(): string {
  return `+98915${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
}

async function createPendingBooking(
  request: APIRequestContext,
  testInfo: TestInfo,
  guestPhone: string,
  markBookingCreated: (reference?: string) => void,
): Promise<{ reference: string; checkIn: string }> {
  const start = 5 + (titleHash(testInfo.title) % 45);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const checkIn = addUtcDays(start + attempt);
    const checkOut = addStayDays(checkIn, 2);
    const query = new URLSearchParams({ checkIn, checkOut, guests: '2' });
    const availability = await request.get(`${apiBaseUrl}/availability?${query}`);
    if (!availability.ok()) {
      throw new Error(`Room-board setup availability failed with ${availability.status()}.`);
    }
    const result: unknown = await availability.json();
    if (!isAvailabilityResult(result)) {
      throw new Error('Room-board setup returned invalid availability data.');
    }
    const roomType = result.roomTypes.find((item) => item.slug === 'garden-double');
    if (!roomType?.isAvailable || roomType.availableRooms < 1) continue;

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
        guestEmail: 'staff-room-board@example.test',
      },
    });
    const payload: unknown = await response.json().catch(() => undefined);
    const reference =
      typeof payload === 'object' &&
      payload !== null &&
      'reference' in payload &&
      typeof payload.reference === 'string'
        ? payload.reference.trim()
        : undefined;
    if (response.status() === 201) markBookingCreated(reference);
    expect(response.status()).toBe(201);
    if (!reference) throw new Error('Room-board setup response did not include a booking reference.');
    return { reference, checkIn };
  }

  throw new Error('No future garden room was available for the room-board browser test.');
}

test('staff assigns and unassigns a room from the responsive room board', async (
  { page, request, staffCookies },
  testInfo,
) => {
  const guestPhone = uniqueGuestPhone();
  await page.context().addCookies(staffCookies);

  await withStaffBookingCleanup(page, guestPhone, staffCookies, async (markBookingCreated) => {
    const { reference, checkIn } = await createPendingBooking(
      request,
      testInfo,
      guestPhone,
      markBookingCreated,
    );
    await page.goto('/staff/bookings');
    await expect(page.getByRole('heading', { name: 'درخواست‌های اقامت' })).toBeVisible();
    await page.getByLabel('کد رزرو یا موبایل').fill(reference);
    await page.getByRole('button', { name: 'اعمال فیلترها' }).click();
    const booking = page.getByRole('button', { name: new RegExp(reference) });
    await expect(booking).toBeVisible();
    await booking.click();
    await expect(page.getByRole('heading', { name: `جزئیات رزرو ${reference}` })).toBeVisible();
    await page.getByRole('button', { name: 'تأیید رزرو' }).click();
    await page.getByRole('button', { name: 'بله، رزرو را تأیید می‌کنم' }).click();
    await expect(page.getByText('رزرو تأیید شد.')).toBeVisible();

    await page.goto('/staff/rooms');
    await expect(page.getByRole('heading', { name: 'وضعیت اتاق‌ها' })).toBeVisible();
    const dateInput = page.getByLabel('تاریخ تابلو');
    await dateInput.fill(formatGregorianAsJalali(checkIn) ?? checkIn);
    await page.getByRole('button', { name: 'اعمال فیلترها' }).click();

    const bookingCard = page
      .getByRole('region', { name: 'تخصیص اتاق به رزروها' })
      .getByRole('article')
      .filter({ hasText: reference });
    await expect(bookingCard).toBeVisible();
    await expect(bookingCard).toContainText('۱ واحد بدون تخصیص');

    if (testInfo.project.name === 'mobile-chrome') {
      const dimensions = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    }
    await page.screenshot({ path: testInfo.outputPath('room-board.png'), fullPage: true });

    await bookingCard.getByRole('button', { name: `ویرایش تخصیص اتاق ${reference}` }).click();
    await expect(page.getByRole('heading', { name: new RegExp(reference) })).toBeVisible();
    await page.getByRole('button', { name: 'افزودن اتاق به تخصیص' }).click();
    const roomSelect = page.getByLabel('اتاق تخصیص 1');
    expect(await roomSelect.locator('option').count()).toBeGreaterThan(1);
    await page.getByLabel('دلیل تغییر تخصیص').fill('تخصیص هنگام پذیرش آزمایشی');
    await page.getByRole('button', { name: 'ذخیره تخصیص‌ها' }).click();

    await expect(page.getByRole('status')).toContainText(`تخصیص اتاق‌های رزرو ${reference} ذخیره شد.`);
    await expect(bookingCard).toContainText('۰ واحد بدون تخصیص');
    await expect(bookingCard).toContainText('۱ از ۱ واحد برای این تاریخ تخصیص دارد');

    await bookingCard.getByRole('button', { name: `ویرایش تخصیص اتاق ${reference}` }).click();
    await expect(page.getByRole('group', { name: /تخصیص اتاق/ })).toBeVisible();
    await page.getByRole('button', { name: /حذف اتاق .* از تخصیص/ }).click();
    await page.getByRole('textbox', { name: 'دلیل تغییر تخصیص' }).fill('لغو تخصیص آزمایشی');
    await page.getByRole('button', { name: 'ذخیره تخصیص‌ها' }).click();

    await expect(page.getByRole('status')).toContainText(`تخصیص اتاق‌های رزرو ${reference} ذخیره شد.`);
    await expect(bookingCard).toContainText('۱ واحد بدون تخصیص');
    await expect(bookingCard).toContainText('۰ از ۱ واحد برای این تاریخ تخصیص دارد');
  });
});
