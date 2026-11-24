import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { formatGregorianAsJalali } from '../src/lib/jalali-date';
import { test, withFailureSafeCleanup } from './staff-fixtures';
import { createHousekeepingStaffSession } from './housekeeping-fixtures';
import { prepareReleaseScreenshot, releaseScreenshotStyle } from './release-screenshot';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addHotelDays(days: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function sessionHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies(`${apiBaseUrl}/staff`);
  const session = cookies.find((cookie) => cookie.name === 'hotel_staff_session')?.value;
  const csrf = cookies.find((cookie) => cookie.name === 'hotel_staff_csrf')?.value;
  if (!session || !csrf) throw new Error('The authenticated admin session is unavailable.');
  return {
    Cookie: `hotel_staff_session=${session}; hotel_staff_csrf=${csrf}`,
    Origin: `http://127.0.0.1:${process.env.HBE_E2E_WEB_PORT ?? '3015'}`,
    Referer: `${process.env.HBE_E2E_WEB_PORT ? `http://127.0.0.1:${process.env.HBE_E2E_WEB_PORT}` : 'http://127.0.0.1:3015'}/staff/maintenance`,
    'X-CSRF-Token': csrf,
  };
}

test('manager creates a repair, assigns and resolves it, then blocks and restores a room', async ({
  page,
  browser,
  staffCookies,
}, testInfo) => {
  await page.context().addCookies(staffCookies);
  await withFailureSafeCleanup(async (registerCleanup) => {
    const manager = await createHousekeepingStaffSession(
      page,
      browser,
      'MANAGER',
      registerCleanup,
      'HPM006',
    );
    const staffPage = manager.page;
    const roomNumber = `HPM006-${randomUUID().slice(0, 8)}`;
    let roomId: string | undefined;
    let requestId: string | undefined;
    let blockId: string | undefined;
    let headers: Record<string, string> | undefined;

    try {
      headers = await sessionHeaders(staffPage);
      const typeResponse = await staffPage.request.get(`${apiBaseUrl}/staff/inventory/room-types`, {
        headers,
      });
      expect(typeResponse.status()).toBe(200);
      const typePayload: unknown = await typeResponse.json();
      if (!Array.isArray(typePayload))
        throw new Error('Inventory room types were not returned as a list.');
      const roomType = typePayload.find(
        (item) => isRecord(item) && item.isActive === true && typeof item.id === 'string',
      );
      if (!isRecord(roomType) || typeof roomType.id !== 'string') {
        throw new Error('The isolated database has no active room type for maintenance E2E.');
      }

      const roomResponse = await staffPage.request.post(`${apiBaseUrl}/staff/rooms`, {
        headers,
        data: { roomTypeId: roomType.id, roomNumber, floor: '۹', features: [] },
      });
      const roomResponseBody = await roomResponse.text();
      expect(roomResponse.status(), roomResponseBody).toBe(201);
      const createdRoom: unknown = JSON.parse(roomResponseBody);
      if (!isRecord(createdRoom) || typeof createdRoom.id !== 'string') {
        throw new Error('Maintenance room fixture did not return an ID.');
      }
      roomId = createdRoom.id;

      await staffPage.goto('/staff/maintenance');
      await expect(staffPage.getByRole('heading', { name: 'تعمیرات و انسداد اتاق' })).toBeVisible();
      await expect(staffPage.getByRole('link', { name: /^تعمیرات/ })).toHaveAttribute(
        'aria-current',
        'page',
      );

      const roomSelect = staffPage.getByLabel('اتاق برای درخواست تعمیر');
      await expect(roomSelect.locator(`option[value="${roomId}"]`)).toBeAttached();
      await roomSelect.selectOption(roomId);
      await staffPage.getByLabel('نوع تعمیر').selectOption('PLUMBING');
      await staffPage.getByLabel('شرح مشکل').fill(`HPM-006 test ${roomNumber}: tap valve drips`);
      const expectedDate = addHotelDays(120);
      await staffPage
        .getByLabel('موعد تقریبی رسیدگی')
        .fill(formatGregorianAsJalali(expectedDate) ?? expectedDate);
      const createRequestResponse = staffPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === '/api/v1/staff/maintenance/requests' &&
          response.request().method() === 'POST'
        );
      });
      await staffPage.getByRole('button', { name: 'ثبت درخواست تعمیر' }).first().click();
      const requestResponse = await createRequestResponse;
      expect(requestResponse.status()).toBe(201);
      const createdRequest: unknown = await requestResponse.json();
      if (!isRecord(createdRequest) || typeof createdRequest.id !== 'string') {
        throw new Error('Maintenance request creation did not return an ID.');
      }
      requestId = createdRequest.id;
      expect(requestResponse.headers()['cache-control']).toContain('no-store');
      expect(JSON.stringify(createdRequest)).not.toMatch(/guestName|guestPhone|folioBalance/i);

      const filters = staffPage.getByText('فیلتر درخواست‌ها و انسدادها');
      await filters.click();
      await staffPage.getByLabel('فیلتر اتاق').selectOption(roomId);
      await staffPage.getByRole('button', { name: 'اعمال فیلتر' }).click();
      const requestCard = staffPage.locator(`[data-maintenance-request-id="${requestId}"]`);
      await expect(requestCard).toBeVisible();
      await requestCard.getByLabel('واگذاری به').selectOption({ index: 1 });
      await requestCard.getByRole('button', { name: 'ثبت مسئول' }).click();
      await expect(staffPage.getByRole('status')).toContainText('مسئول درخواست به‌روزرسانی شد');
      await requestCard.getByLabel('یادداشت رفع مشکل').fill('Valve washer replaced');
      const resolveResponse = staffPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === `/api/v1/staff/maintenance/requests/${requestId}/resolve`;
      });
      await requestCard.getByRole('button', { name: 'ثبت رفع مشکل' }).click();
      expect((await resolveResponse).status()).toBe(200);
      await expect(requestCard.getByText('برطرف‌شده')).toBeVisible();

      await staffPage.getByText('ثبت انسداد اتاق و بازه بازگشت').click();
      await staffPage.getByLabel('اتاق برای انسداد').selectOption(roomId);
      const startDate = addHotelDays(150);
      const returnDate = addHotelDays(154);
      await staffPage
        .getByLabel('شروع انسداد')
        .fill(formatGregorianAsJalali(startDate) ?? startDate);
      await staffPage
        .locator('#maintenance-block-end')
        .fill(formatGregorianAsJalali(returnDate) ?? returnDate);
      await staffPage
        .locator('#maintenance-block-reason')
        .fill(`HPM-006 test: repair ${roomNumber}`);
      const createBlockResponse = staffPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === '/api/v1/staff/maintenance/blocks' &&
          response.request().method() === 'POST'
        );
      });
      await staffPage.getByRole('button', { name: 'ثبت بازه انسداد' }).click();
      const blockResponse = await createBlockResponse;
      expect(blockResponse.status()).toBe(201);
      const createdBlock: unknown = await blockResponse.json();
      if (!isRecord(createdBlock) || typeof createdBlock.id !== 'string') {
        throw new Error('Room block creation did not return an ID.');
      }
      blockId = createdBlock.id;
      expect(blockResponse.headers()['cache-control']).toContain('no-store');

      const blockCard = staffPage.locator(`[data-room-block-id="${blockId}"]`);
      await expect(blockCard).toBeVisible();
      await expect(blockCard).toContainText('فعال');
      await blockCard.getByLabel('دلیل بازگردانی').fill('Work completed and checked');
      const restoreResponse = staffPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === `/api/v1/staff/maintenance/blocks/${blockId}/restore`;
      });
      await blockCard.getByRole('button', { name: 'بازگرداندن اتاق به ظرفیت فروش' }).click();
      expect((await restoreResponse).status()).toBe(200);
      await expect(blockCard).toContainText('ظرفیت بازگشته');
      await prepareReleaseScreenshot(staffPage);
      await staffPage.screenshot({
        path: testInfo.outputPath(
          `hpm006-maintenance-${staffPage.viewportSize()?.width ?? 'unknown'}.png`,
        ),
        fullPage: true,
        style: releaseScreenshotStyle,
      });
    } finally {
      if (!headers) headers = await sessionHeaders(staffPage);
      if (blockId) {
        await staffPage.request.post(`${apiBaseUrl}/staff/maintenance/blocks/${blockId}/restore`, {
          headers,
          data: { reason: 'HPM-006 E2E cleanup after room service.' },
        });
      }
      if (requestId) {
        await staffPage.request.post(
          `${apiBaseUrl}/staff/maintenance/requests/${requestId}/resolve`,
          {
            headers,
            data: { resolutionNote: 'HPM-006 E2E cleanup completed.' },
          },
        );
      }
      if (roomId) {
        await staffPage.request.post(`${apiBaseUrl}/staff/rooms/${roomId}/deactivate`, { headers });
      }
    }
  });
});
