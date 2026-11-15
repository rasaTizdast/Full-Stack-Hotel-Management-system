import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import {
  test,
  withFailureSafeCleanup,
  type StaffBrowserCookie,
} from './staff-fixtures';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const apiBaseUrl = `http://localhost:${apiPort}/api/v1`;

test.beforeEach(async ({ page, staffCookies }) => {
  await page.context().addCookies(staffCookies);
});

async function currentStaffHeaders(page: Page, fallbackCookies: StaffBrowserCookie[]) {
  const currentCookies = await page.context().cookies(`${apiBaseUrl}/staff`);
  const cookies = new Map(currentCookies.map((cookie) => [cookie.name, cookie.value]));
  for (const cookie of fallbackCookies) {
    if (!cookies.has(cookie.name)) cookies.set(cookie.name, cookie.value);
  }
  const session = cookies.get('hotel_staff_session');
  const csrf = cookies.get('hotel_staff_csrf');
  if (!session || !csrf) throw new Error('The staff session was unavailable for room cleanup.');
  return {
    Cookie: `hotel_staff_session=${session}; hotel_staff_csrf=${csrf}`,
    'X-CSRF-Token': csrf,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('admin manages physical rooms through filters, create, renumber, duplicate conflict, and status changes', async ({
  page,
  staffCookies,
}, testInfo) => {
  const roomNumber = `E2E-${randomUUID().slice(0, 8)}`;
  const replacementNumber = `${roomNumber}-R`;
  let roomId: string | undefined;

  await withFailureSafeCleanup(async (registerCleanup) => {
    registerCleanup(async () => {
      const headers = await currentStaffHeaders(page, staffCookies);
      const query = new URLSearchParams({ search: roomNumber });
      const lookup = await page.request.get(`${apiBaseUrl}/staff/rooms?${query}`, { headers });
      if (!lookup.ok()) throw new Error(`Room fixture lookup failed with HTTP ${lookup.status()}.`);
      const payload: unknown = await lookup.json();
      if (!isRecord(payload) || !Array.isArray(payload.items)) {
        throw new Error('Room fixture lookup returned an invalid response.');
      }
      const fixtureRoom = payload.items.find(
        (room) =>
          isRecord(room) &&
          (room.roomNumber === roomNumber || room.roomNumber === replacementNumber) &&
          (roomId === undefined || room.id === roomId),
      );
      if (!isRecord(fixtureRoom) || typeof fixtureRoom.id !== 'string') return;
      if (fixtureRoom.isActive === true) {
        const deactivated = await page.request.post(
          `${apiBaseUrl}/staff/rooms/${encodeURIComponent(fixtureRoom.id)}/deactivate`,
          { headers },
        );
        if (!deactivated.ok()) {
          throw new Error(`Room fixture deactivation failed with HTTP ${deactivated.status()}.`);
        }
      }
    });

    await page.goto('/staff/rooms/manage');
    await expect(page.getByRole('heading', { level: 1, name: 'اتاق‌ها', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^اتاق‌های فیزیکی/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const createForm = page.getByRole('form', { name: 'افزودن اتاق' });
    const roomType = createForm.getByLabel('نوع اتاق');
    await roomType.selectOption({ label: 'اتاق دوتخته باغ' });
    const roomTypeId = await roomType.inputValue();
    await createForm.getByLabel('شماره اتاق').fill(roomNumber);
    await createForm.getByLabel('طبقه').fill('۹');
    await createForm.getByLabel('امکانات').fill('بالکن، نمای باغ');
    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/staff/rooms' && response.request().method() === 'POST';
    });
    await createForm.getByRole('button', { name: 'افزودن اتاق' }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created: unknown = await createResponse.json();
    if (!isRecord(created) || typeof created.id !== 'string') {
      throw new Error('Room creation did not return a room ID.');
    }
    roomId = created.id;
    await expect(page.getByRole('status')).toContainText(`اتاق ${roomNumber} اضافه شد.`);

    const filters = page.getByRole('form', { name: 'فیلتر اتاق‌ها' });
    await filters.getByLabel('نوع اتاق').selectOption(roomTypeId);
    await filters.getByLabel('طبقه').fill('۹');
    await filters.getByLabel('وضعیت اتاق').selectOption('true');
    await filters.getByLabel('جست‌وجوی شماره اتاق').fill(roomNumber);
    await filters.getByRole('button', { name: 'اعمال فیلترها' }).click();
    const originalCard = page.getByRole('article', { name: roomNumber });
    await expect(originalCard).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('staff-rooms-manage.png'),
      fullPage: true,
    });

    // Seed promotes its generated records to canonical demo numbers. Simulate the legacy marker
    // on this isolated room so the real PATCH response can verify that renumbering clears it.
    let markGeneratedOnNextListRead = true;
    await page.route(`${apiBaseUrl}/staff/rooms*`, async (route) => {
      if (route.request().method() !== 'GET' || !markGeneratedOnNextListRead) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.items)) {
        await route.fulfill({ response, json: payload });
        return;
      }
      const items = payload.items.map((item) =>
        isRecord(item) && item.id === roomId ? { ...item, isGenerated: true } : item,
      );
      markGeneratedOnNextListRead = false;
      await route.fulfill({ response, json: { ...payload, items } });
    });
    await page.reload();
    const generatedCard = page.getByRole('article', { name: roomNumber });
    await expect(generatedCard.getByText('شمارهٔ پیشنهادی')).toBeVisible();
    await generatedCard.getByRole('button', { name: `ویرایش اتاق ${roomNumber}` }).click();
    const editForm = page.getByRole('form', { name: 'ویرایش اتاق' });
    await expect(editForm.getByText('شماره‌های نمونه باید پیش از بهره‌برداری با شماره واقعی جایگزین شوند.')).toBeVisible();
    await editForm.getByLabel('شماره اتاق').fill(replacementNumber);
    const updateResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === `/api/v1/staff/rooms/${roomId}` && response.request().method() === 'PATCH';
    });
    await editForm.getByRole('button', { name: 'ذخیره تغییرات اتاق' }).click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status()).toBe(200);
    await expect(page.getByRole('article', { name: replacementNumber }).getByText('شمارهٔ پیشنهادی')).toHaveCount(0);
    const updated: unknown = await updateResponse.json();
    expect(updated).toMatchObject({ roomNumber: replacementNumber, isGenerated: false });

    const duplicateForm = page.getByRole('form', { name: 'افزودن اتاق' });
    await duplicateForm.getByLabel('شماره اتاق').fill(replacementNumber);
    const duplicateResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/staff/rooms' && response.request().method() === 'POST';
    });
    await duplicateForm.getByRole('button', { name: 'افزودن اتاق' }).click();
    const duplicateResponse = await duplicateResponsePromise;
    expect(duplicateResponse.status()).toBe(409);
    expect(await duplicateResponse.json()).toMatchObject({ code: 'ROOM_NUMBER_TAKEN' });
    await expect(duplicateForm.getByLabel('شماره اتاق')).toHaveAttribute('aria-invalid', 'true');
    await expect(duplicateForm.getByRole('alert')).toHaveText(
      'این شماره قبلاً برای اتاق دیگری ثبت شده است.',
    );

    const filtersAfterRenumber = page.getByRole('form', { name: 'فیلتر اتاق‌ها' });
    await filtersAfterRenumber.getByLabel('جست‌وجوی شماره اتاق').fill(replacementNumber);
    await filtersAfterRenumber.getByRole('button', { name: 'اعمال فیلترها' }).click();
    const activeCard = page.getByRole('article', { name: replacementNumber });
    await expect(activeCard).toBeVisible();
    await activeCard.getByRole('button', { name: `غیرفعال‌کردن اتاق ${replacementNumber}` }).click();
    const deactivateDialog = page.getByRole('alertdialog', { name: 'غیرفعال‌کردن اتاق' });
    const deactivateResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/staff/rooms/${roomId}/deactivate`),
    );
    await deactivateDialog.getByRole('button', { name: 'تأیید غیرفعال‌سازی' }).click();
    expect((await deactivateResponsePromise).status()).toBe(200);
    await expect(activeCard).toHaveCount(0);

    const inactiveFilters = page.getByRole('form', { name: 'فیلتر اتاق‌ها' });
    await inactiveFilters.getByLabel('وضعیت اتاق').selectOption('false');
    await inactiveFilters.getByRole('button', { name: 'اعمال فیلترها' }).click();
    const inactiveCard = page.getByRole('article', { name: replacementNumber });
    await expect(inactiveCard).toBeVisible();
    await inactiveCard.getByRole('button', { name: `فعال‌کردن اتاق ${replacementNumber}` }).click();
    const reactivateDialog = page.getByRole('alertdialog', { name: 'فعال‌کردن دوباره اتاق' });
    const reactivateResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/staff/rooms/${roomId}/reactivate`),
    );
    await reactivateDialog.getByRole('button', { name: 'تأیید فعال‌سازی' }).click();
    expect((await reactivateResponsePromise).status()).toBe(200);
    await expect(inactiveCard).toHaveCount(0);
  });
});
