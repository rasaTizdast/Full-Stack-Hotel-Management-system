import { randomInt, randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { toGregorianIso } from '../src/lib/jalali-date';
import { findAvailableGardenStay } from './available-stay';
import {
  test,
  withFailureSafeCleanup,
  withStaffBookingCleanup,
  type StaffBrowserCookie,
} from './staff-fixtures';
import type { Page } from '@playwright/test';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4016';
const apiBaseUrl = `http://localhost:${apiPort}/api/v1`;

test.beforeEach(async ({ page, staffCookies }) => {
  await page.context().addCookies(staffCookies);
});

type InventoryNightSnapshot = {
  stayDate: string;
  totalRooms: number;
  nightlyPriceToman: string;
};

type InventorySnapshot = {
  roomTypeId: string;
  nights: InventoryNightSnapshot[];
};

async function currentStaffHeaders(page: Page, fallbackCookies: StaffBrowserCookie[]) {
  const currentCookies = await page.context().cookies(`${apiBaseUrl}/staff`);
  const cookies = new Map(currentCookies.map((cookie) => [cookie.name, cookie.value]));
  for (const cookie of fallbackCookies) {
    if (!cookies.has(cookie.name)) cookies.set(cookie.name, cookie.value);
  }

  const session = cookies.get('hotel_staff_session');
  const csrf = cookies.get('hotel_staff_csrf');
  if (!session || !csrf)
    throw new Error('The staff session was unavailable for inventory cleanup.');
  return {
    Cookie: `hotel_staff_session=${session}; hotel_staff_csrf=${csrf}`,
    'X-CSRF-Token': csrf,
  };
}

async function readInventorySnapshot(
  page: Page,
  roomTypeId: string,
  startDate: string,
  endDate: string,
  staffCookies: StaffBrowserCookie[],
): Promise<InventorySnapshot> {
  const query = new URLSearchParams({ roomTypeId, startDate, endDate });
  const response = await page.request.get(`${apiBaseUrl}/staff/inventory?${query.toString()}`, {
    headers: await currentStaffHeaders(page, staffCookies),
  });
  if (!response.ok()) {
    throw new Error(`Inventory fixture snapshot failed with HTTP ${response.status()}.`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.nights)) {
    throw new Error('Inventory fixture snapshot returned an invalid response.');
  }
  const nights = payload.nights.flatMap((night): InventoryNightSnapshot[] => {
    if (
      !isRecord(night) ||
      typeof night.stayDate !== 'string' ||
      !Number.isSafeInteger(night.totalRooms) ||
      typeof night.nightlyPriceToman !== 'string' ||
      !/^\d+$/.test(night.nightlyPriceToman)
    ) {
      return [];
    }
    return [
      {
        stayDate: night.stayDate,
        totalRooms: night.totalRooms as number,
        nightlyPriceToman: night.nightlyPriceToman,
      },
    ];
  });
  if (nights.length !== payload.nights.length || nights.length === 0) {
    throw new Error('Inventory fixture snapshot did not include complete configured nights.');
  }
  return { roomTypeId, nights };
}

async function restoreInventorySnapshot(
  page: Page,
  snapshot: InventorySnapshot,
  staffCookies: StaffBrowserCookie[],
) {
  for (const night of snapshot.nights) {
    const nextNight = new Date(`${night.stayDate}T00:00:00.000Z`);
    nextNight.setUTCDate(nextNight.getUTCDate() + 1);
    const response = await page.request.put(`${apiBaseUrl}/staff/inventory`, {
      headers: await currentStaffHeaders(page, staffCookies),
      data: {
        roomTypeId: snapshot.roomTypeId,
        startDate: night.stayDate,
        endDate: nextNight.toISOString().slice(0, 10),
        totalRooms: night.totalRooms,
        nightlyPriceToman: night.nightlyPriceToman,
      },
    });
    if (!response.ok()) {
      throw new Error(`Inventory fixture restoration failed with HTTP ${response.status()}.`);
    }
  }

  const firstNight = snapshot.nights[0]?.stayDate;
  const lastNight = snapshot.nights.at(-1)?.stayDate;
  if (!firstNight || !lastNight) throw new Error('Inventory fixture snapshot was empty.');
  const endDate = new Date(`${lastNight}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const restored = await readInventorySnapshot(
    page,
    snapshot.roomTypeId,
    firstNight,
    endDate.toISOString().slice(0, 10),
    staffCookies,
  );
  expect(restored).toEqual(snapshot);
}

test('admin can inspect and batch-save inventory, and the page meets axe checks', async ({
  page,
  staffCookies,
}) => {
  await withFailureSafeCleanup(async (registerCleanup) => {
    await page.goto('/staff/inventory');

    const table = page.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
    await expect(table).toBeVisible();
    const roomType = page.getByRole('combobox', { name: 'نوع اتاق' });
    await expect(roomType).toHaveValue(/.+/);
    const roomTypeId = await roomType.inputValue();
    const startDate = toGregorianIso(await page.getByLabel('شروع بازه').inputValue());
    const endDate = toGregorianIso(await page.getByLabel('پایان بازه').inputValue());
    if (!startDate || !endDate) throw new Error('The default inventory date range was invalid.');
    const snapshot = await readInventorySnapshot(
      page,
      roomTypeId,
      startDate,
      endDate,
      staffCookies,
    );
    let saveAttempted = false;
    registerCleanup(async () => {
      if (saveAttempted) await restoreInventorySnapshot(page, snapshot, staffCookies);
    });

    const capacity = page.getByLabel('ظرفیت کل اتاق‌ها');
    const originalCapacity = Number(await capacity.inputValue());
    expect(Number.isSafeInteger(originalCapacity)).toBe(true);
    await capacity.fill(String(originalCapacity + 1));
    saveAttempted = true;
    await page.getByRole('button', { name: 'ذخیره برای همه شب‌ها' }).click();

    await expect(page.getByRole('status')).toContainText('شب ذخیره شد');
    await expect(capacity).toHaveValue(String(originalCapacity + 1));
    await expect(table.getByRole('row').nth(1).getByRole('cell').nth(0)).toHaveText(
      new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(originalCapacity + 1),
    );

    const results = await new AxeBuilder({ page })
      .include('.staff-inventory')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('inventory editor rejects capacity below a real pending booking hold', async ({
  page,
  request,
  staffCookies,
}, testInfo) => {
  const stay = await findAvailableGardenStay(request, testInfo);
  const checkIn = toGregorianIso(stay.checkInJalali);
  const checkOut = toGregorianIso(stay.checkOutJalali);
  if (!checkIn || !checkOut) throw new Error('The available stay dates were invalid.');
  const guestPhone = `+98916${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
  const guestEmail = `hbe020-oversell-${randomUUID()}@example.test`;
  let inventorySnapshot: InventorySnapshot | undefined;
  let inventoryUpdateAttempted = false;

  await withFailureSafeCleanup(async (registerCleanup) => {
    registerCleanup(async () => {
      if (inventoryUpdateAttempted && inventorySnapshot) {
        await restoreInventorySnapshot(page, inventorySnapshot, staffCookies);
      }
    });

    await withStaffBookingCleanup(page, guestPhone, staffCookies, async (markBookingCreated) => {
      markBookingCreated();
      const bookingResponse = await request.post(`${apiBaseUrl}/bookings`, {
        headers: { 'Idempotency-Key': randomUUID() },
        data: {
          roomTypeSlug: 'garden-double',
          checkIn,
          checkOut,
          guestCount: 2,
          roomQuantity: 1,
          guestName: 'مریم رضایی؛ آزمون موجودی HBE-020',
          guestPhone,
          guestEmail,
        },
      });
      const bookingPayload: unknown = await bookingResponse.json().catch(() => undefined);
      if (bookingResponse.status() === 201) {
        markBookingCreated(
          isRecord(bookingPayload) &&
            typeof bookingPayload.reference === 'string' &&
            /^[A-Za-z0-9_-]{12,16}$/.test(bookingPayload.reference.trim())
            ? bookingPayload.reference.trim()
            : undefined,
        );
      }

      expect(bookingResponse.status()).toBe(201);
      if (
        !isRecord(bookingPayload) ||
        typeof bookingPayload.reference !== 'string' ||
        !/^[A-Za-z0-9_-]{12,16}$/.test(bookingPayload.reference.trim())
      ) {
        throw new Error('The pending inventory fixture did not return a booking reference.');
      }

      await page.goto('/staff/inventory');
      const roomType = page.getByRole('combobox', { name: 'نوع اتاق' });
      await roomType.selectOption({ label: 'اتاق دوتخته باغ' });
      await page.getByLabel('شروع بازه').fill(stay.checkInJalali);
      await page.getByLabel('پایان بازه').fill(stay.checkOutJalali);
      await page.getByRole('button', { name: 'نمایش بازه' }).click();

      const roomTypeId = await roomType.inputValue();
      inventorySnapshot = await readInventorySnapshot(
        page,
        roomTypeId,
        checkIn,
        checkOut,
        staffCookies,
      );
      const inventoryTable = page.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
      const rows = inventoryTable.getByRole('row');
      await expect(rows).toHaveCount(3);
      const initialCapacities = await Promise.all(
        [1, 2].map((rowIndex) => rows.nth(rowIndex).getByRole('cell').nth(1).innerText()),
      );
      for (const rowIndex of [1, 2]) {
        await expect(rows.nth(rowIndex).getByRole('cell').nth(3)).toContainText(/[۱-۹]/);
      }

      const capacity = page.getByLabel('ظرفیت کل اتاق‌ها');
      await capacity.fill('0');
      const saveResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === '/api/v1/staff/inventory' && response.request().method() === 'PUT';
      });
      inventoryUpdateAttempted = true;
      await page.getByRole('button', { name: 'ذخیره برای همه شب‌ها' }).click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.status()).toBe(409);
      expect(await saveResponse.json()).toMatchObject({ code: 'CAPACITY_BELOW_RESERVED' });
      await expect(capacity).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#staff-inventory-capacity-error')).toHaveText(
        'ظرفیت نمی‌تواند از مجموع اتاق‌های در انتظار تأیید و رزروشده کمتر باشد.',
      );

      await page.getByRole('button', { name: 'نمایش بازه' }).click();
      await expect(rows).toHaveCount(3);
      const persistedCapacities = await Promise.all(
        [1, 2].map((rowIndex) => rows.nth(rowIndex).getByRole('cell').nth(1).innerText()),
      );
      expect(persistedCapacities).toEqual(initialCapacities);
    });
  });
});

test('receptionist does not see or request the admin inventory editor', async ({ page }) => {
  let roomTypeRequestCount = 0;
  await page.route(`${apiBaseUrl}/staff/auth/me`, async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    await route.fulfill({
      response,
      json: { ...session, staff: { ...session.staff, role: 'RECEPTIONIST' } },
    });
  });
  await page.route(`${apiBaseUrl}/staff/inventory/room-types`, (route) => {
    roomTypeRequestCount += 1;
    return route.continue();
  });

  await page.goto('/staff');
  await expect(page.getByRole('link', { name: 'ظرفیت و نرخ‌ها' })).toHaveCount(0);
  await page.goto('/staff/inventory');
  await expect(page.getByRole('heading', { name: 'دسترسی به مدیریت موجودی' })).toBeVisible();
  await expect(page.getByLabel('نوع اتاق')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ذخیره برای همه شب‌ها' })).toHaveCount(0);
  expect(roomTypeRequestCount).toBe(0);
});

test('inventory editor remains keyboard reachable on mobile', async ({ page }) => {
  await page.goto('/staff/inventory');
  await expect(page.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' })).toBeVisible();

  const focusedIds: string[] = [];
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press('Tab');
    focusedIds.push(await page.evaluate(() => (document.activeElement as HTMLElement).id));
  }

  expect(focusedIds).toContain('staff-inventory-room-type');
  expect(focusedIds).toContain('staff-inventory-start-date');
  expect(focusedIds).toContain('staff-inventory-end-date');
  expect(focusedIds).toContain('staff-inventory-capacity');
  expect(focusedIds).toContain('staff-inventory-nightly-price');
});
