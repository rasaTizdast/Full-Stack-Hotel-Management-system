import { randomInt, randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { isAvailabilityResult } from '../src/lib/availability';
import { test, withStaffBookingCleanup } from './staff-fixtures';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const webPort = process.env.HBE_E2E_WEB_PORT ?? '3015';
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const webOrigin = `http://127.0.0.1:${webPort}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addDays(dateOnly: string, offsetDays: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function sessionHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies(`${apiBaseUrl}/staff`);
  const session = cookies.find((cookie) => cookie.name === 'hotel_staff_session')?.value;
  const csrf = cookies.find((cookie) => cookie.name === 'hotel_staff_csrf')?.value;
  if (!session || !csrf) throw new Error('The authenticated admin session is unavailable.');
  return {
    Cookie: `hotel_staff_session=${session}; hotel_staff_csrf=${csrf}`,
    Origin: webOrigin,
    Referer: `${webOrigin}/staff`,
    'X-CSRF-Token': csrf,
  };
}

test('admin manages the service catalog and opens a private interim folio', async ({
  page,
  staffCookies,
}, testInfo) => {
  await page.context().addCookies(staffCookies);
  const guestPhone = `+98915${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
  const serviceName = 'خدمت آزمایشی مرورگر HPM007';
  const headers = await sessionHeaders(page);

  await withStaffBookingCleanup(page, guestPhone, staffCookies, async (bookingCreated) => {
    const businessDateResponse = await page.request.get(`${apiBaseUrl}/staff/rooms/board`, {
      headers,
    });
    expect(businessDateResponse.status()).toBe(200);
    const board: unknown = await businessDateResponse.json();
    if (!isRecord(board) || typeof board.businessDate !== 'string') {
      throw new Error('The room board did not return the hotel business date.');
    }
    let stay: { roomTypeSlug: string; checkIn: string; checkOut: string } | undefined;
    for (let attempt = 5; attempt < 85 && !stay; attempt += 1) {
      const checkIn = addDays(board.businessDate, attempt);
      const checkOut = addDays(checkIn, 2);
      const query = new URLSearchParams({ checkIn, checkOut, guests: '1' });
      const availabilityResponse = await page.request.get(
        `${apiBaseUrl}/availability?${query.toString()}`,
      );
      expect(availabilityResponse.status()).toBe(200);
      const availability: unknown = await availabilityResponse.json();
      if (!isAvailabilityResult(availability)) {
        throw new Error('Folio fixture availability returned an invalid response.');
      }
      const availableRoomType = availability.roomTypes.find(
        (roomType) => roomType.isAvailable && roomType.availableRooms > 0,
      );
      if (availableRoomType) {
        stay = { roomTypeSlug: availableRoomType.slug, checkIn, checkOut };
      }
    }
    if (!stay)
      throw new Error('The isolated database has no future availability for the folio E2E.');

    bookingCreated();
    const bookingResponse = await page.request.post(`${apiBaseUrl}/bookings`, {
      headers: { 'Idempotency-Key': `hpm007-e2e-${randomUUID()}` },
      data: {
        roomTypeSlug: stay.roomTypeSlug,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        guestCount: 1,
        roomQuantity: 1,
        guestName: 'مهمان آزمایشی صورتحساب',
        guestPhone,
      },
    });
    const createdBooking: unknown = await bookingResponse.json();
    expect(bookingResponse.status(), JSON.stringify(createdBooking)).toBe(201);
    if (!isRecord(createdBooking) || typeof createdBooking.reference !== 'string') {
      throw new Error('Folio booking fixture did not return a booking reference.');
    }
    bookingCreated(createdBooking.reference);

    const bookingDetailResponse = await page.request.get(
      `${apiBaseUrl}/staff/bookings/${encodeURIComponent(createdBooking.reference)}`,
      { headers },
    );
    expect(bookingDetailResponse.status()).toBe(200);
    const booking: unknown = await bookingDetailResponse.json();
    if (!isRecord(booking) || typeof booking.id !== 'string') {
      throw new Error('Folio booking detail did not return its internal folio route ID.');
    }

    const catalogResponse = await page.request.get(`${apiBaseUrl}/staff/services`, { headers });
    expect(catalogResponse.status()).toBe(200);
    expect(catalogResponse.headers()['cache-control']).toContain('private, no-store');
    const catalog: unknown = await catalogResponse.json();
    if (!isRecord(catalog) || !Array.isArray(catalog.items)) {
      throw new Error('The private service catalog did not return an item list.');
    }
    const existingService = catalog.items.find(
      (item) => isRecord(item) && item.name === serviceName,
    );
    const existingServiceId =
      isRecord(existingService) && typeof existingService.id === 'string'
        ? existingService.id
        : undefined;

    await page.goto('/staff/services');
    await expect(page.getByRole('heading', { name: 'فهرست خدمات' })).toBeVisible();
    let serviceItemId = existingServiceId;
    if (!serviceItemId) {
      await page.getByLabel('نام خدمت').first().fill(serviceName);
      await page.getByLabel('دسته‌بندی').first().fill('آزمایش مرورگر');
      await page.getByLabel('قیمت فعلی · تومان').first().fill('275000');
      const createServiceResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === '/api/v1/staff/services' && response.request().method() === 'POST';
      });
      await page.getByRole('button', { name: 'افزودن خدمت' }).click();
      const createdServiceResponse = await createServiceResponse;
      expect(createdServiceResponse.status()).toBe(201);
      expect(createdServiceResponse.headers()['cache-control']).toContain('private, no-store');
      const createdService: unknown = await createdServiceResponse.json();
      if (!isRecord(createdService) || typeof createdService.id !== 'string') {
        throw new Error('Service catalog creation did not return an item ID.');
      }
      serviceItemId = createdService.id;
    }
    const serviceRow = page.locator(`[aria-label="ویرایش خدمت ${serviceName}"]`);
    await expect(serviceRow).toBeVisible();
    const activeToggle = serviceRow.getByLabel('برای ثبت‌های جدید فعال باشد');
    if (!(await activeToggle.isChecked())) {
      await activeToggle.check();
      const activateResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === `/api/v1/staff/services/${serviceItemId}` &&
          response.request().method() === 'PATCH'
        );
      });
      await serviceRow.getByRole('button', { name: 'ذخیره تغییرات' }).click();
      const activated = await activateResponse;
      expect(activated.status()).toBe(200);
      expect(activated.headers()['cache-control']).toContain('private, no-store');
      await expect(serviceRow).toContainText('فعال');
    }
    await activeToggle.uncheck();
    const updateServiceResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === `/api/v1/staff/services/${serviceItemId}` &&
        response.request().method() === 'PATCH'
      );
    });
    await serviceRow.getByRole('button', { name: 'ذخیره تغییرات' }).click();
    const updatedServiceResponse = await updateServiceResponse;
    expect(updatedServiceResponse.status()).toBe(200);
    expect(updatedServiceResponse.headers()['cache-control']).toContain('private, no-store');
    await expect(serviceRow).toContainText('غیرفعال');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`hpm007-services-${page.viewportSize()?.width ?? 'unknown'}.png`),
    });

    const folioResponse = await page.request.get(
      `${apiBaseUrl}/staff/folios/${encodeURIComponent(booking.id)}`,
      { headers },
    );
    expect(folioResponse.status()).toBe(200);
    expect(folioResponse.headers()['cache-control']).toContain('private');
    expect(folioResponse.headers()['cache-control']).toContain('no-store');
    const folio: unknown = await folioResponse.json();
    expect(isRecord(folio) && folio.status).toBe('OPEN');
    expect(isRecord(folio) && folio.balanceToman).toBe('0');
    expect(isRecord(folio) && folio.entries).toEqual([]);

    await page.goto(`/staff/folios/${booking.id}`);
    await expect(page.getByRole('heading', { name: 'صورتحساب اقامت' })).toBeVisible();
    await expect(page.getByText('مهمان آزمایشی صورتحساب')).toBeVisible();
    await expect(
      page.getByText('هنوز هزینه یا پرداختی در این صورتحساب ثبت نشده است.'),
    ).toBeVisible();
    await expect(page.getByText('فاکتور مالیاتی محسوب نمی‌شود')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`hpm007-folio-${page.viewportSize()?.width ?? 'unknown'}.png`),
      fullPage: true,
    });
  });
});
