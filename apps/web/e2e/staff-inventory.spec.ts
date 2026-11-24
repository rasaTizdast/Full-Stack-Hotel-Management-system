import { randomInt, randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { formatGregorianAsJalali, toGregorianIso } from '../src/lib/jalali-date';
import { findAvailableGardenStay } from './available-stay';
import {
  test,
  withFailureSafeCleanup,
  withStaffBookingCleanup,
  type StaffBrowserCookie,
} from './staff-fixtures';
import type { Page } from '@playwright/test';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;

test.beforeEach(async ({ page, staffCookies }) => {
  await page.context().addCookies(staffCookies);
});

type InventoryNightSnapshot = {
  stayDate: string;
  capacitySource: 'PROJECTED' | 'HISTORICAL' | 'UNAVAILABLE';
  totalRooms: number | null;
  blockedRooms: number | null;
  heldRooms: number | null;
  bookedRooms: number | null;
  availableRooms: number | null;
  nightlyPriceToman: string | null;
};

type ProjectedCapacityNight = InventoryNightSnapshot & {
  capacitySource: 'PROJECTED';
  totalRooms: number;
  blockedRooms: number;
  heldRooms: number;
  bookedRooms: number;
  availableRooms: number;
};

type PricedProjectedNight = ProjectedCapacityNight & { nightlyPriceToman: string };

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
      !['PROJECTED', 'HISTORICAL', 'UNAVAILABLE'].includes(String(night.capacitySource)) ||
      !isNullableSafeInteger(night.totalRooms) ||
      !isNullableSafeInteger(night.blockedRooms) ||
      !isNullableSafeInteger(night.heldRooms) ||
      !isNullableSafeInteger(night.bookedRooms) ||
      !isNullableSafeInteger(night.availableRooms) ||
      !isNullablePrice(night.nightlyPriceToman)
    ) {
      return [];
    }
    return [
      {
        stayDate: night.stayDate,
        capacitySource: night.capacitySource as InventoryNightSnapshot['capacitySource'],
        totalRooms: night.totalRooms as number | null,
        blockedRooms: night.blockedRooms as number | null,
        heldRooms: night.heldRooms as number | null,
        bookedRooms: night.bookedRooms as number | null,
        availableRooms: night.availableRooms as number | null,
        nightlyPriceToman: night.nightlyPriceToman as string | null,
      },
    ];
  });
  if (nights.length !== payload.nights.length || nights.length === 0) {
    throw new Error('Inventory fixture snapshot did not match the documented night DTO.');
  }
  return { roomTypeId, nights };
}

function isNullableSafeInteger(value: unknown): value is number | null {
  return value === null || Number.isSafeInteger(value);
}

function isNullablePrice(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d+$/.test(value));
}

function isProjectedCapacityNight(night: InventoryNightSnapshot): night is ProjectedCapacityNight {
  return (
    night.capacitySource === 'PROJECTED' &&
    night.totalRooms !== null &&
    night.blockedRooms !== null &&
    night.heldRooms !== null &&
    night.bookedRooms !== null &&
    night.availableRooms !== null
  );
}

function isPricedProjectedNight(night: InventoryNightSnapshot): night is PricedProjectedNight {
  return isProjectedCapacityNight(night) && night.nightlyPriceToman !== null;
}

function requireProjectedCapacityNight(night: InventoryNightSnapshot): ProjectedCapacityNight {
  if (!isProjectedCapacityNight(night)) {
    throw new Error(`Inventory fixture night ${night.stayDate} did not have projected capacity.`);
  }
  return night;
}

function addUtcDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function findPricedProjectedNight(
  page: Page,
  roomTypeId: string,
  startDate: string,
  staffCookies: StaffBrowserCookie[],
): Promise<string | undefined> {
  const endDate = addUtcDays(startDate, 90);
  const snapshot = await readInventorySnapshot(page, roomTypeId, startDate, endDate, staffCookies);
  return snapshot.nights.find(
    (night) => isPricedProjectedNight(night) && night.totalRooms + night.blockedRooms > 0,
  )?.stayDate;
}

async function restoreInventorySnapshot(
  page: Page,
  snapshot: InventorySnapshot,
  staffCookies: StaffBrowserCookie[],
) {
  for (const night of snapshot.nights) {
    if (!isPricedProjectedNight(night)) {
      throw new Error(`Inventory cleanup cannot restore an unpriced night: ${night.stayDate}.`);
    }
    const nextNight = new Date(`${night.stayDate}T00:00:00.000Z`);
    nextNight.setUTCDate(nextNight.getUTCDate() + 1);
    const response = await page.request.put(`${apiBaseUrl}/staff/inventory`, {
      headers: await currentStaffHeaders(page, staffCookies),
      data: {
        roomTypeId: snapshot.roomTypeId,
        startDate: night.stayDate,
        endDate: nextNight.toISOString().slice(0, 10),
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

test('admin sees physical capacity and saves rates only, and the page meets axe checks', async ({
  page,
  staffCookies,
}, testInfo) => {
  await withFailureSafeCleanup(async (registerCleanup) => {
    const roomTypesResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/v1/staff/inventory/room-types' &&
        response.request().method() === 'GET'
      );
    });
    await page.goto('/staff/inventory');
    const roomTypesResponse = await roomTypesResponsePromise;
    expect(roomTypesResponse.headers()['cache-control']).toContain('private, no-store');

    const table = page.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
    const isNarrowViewport = (page.viewportSize()?.width ?? 0) <= 760;
    const activeInventoryLink = page.getByRole('link', { name: /^ظرفیت و نرخ‌ها/ });
    await expect(activeInventoryLink).toHaveAttribute('aria-current', 'page');
    if ((page.viewportSize()?.width ?? 0) <= 640) {
      await expect(page.locator('[data-staff-nav-overflow-cue]')).toBeVisible();
      const navBox = await page.getByRole('navigation', { name: 'منوی پنل کارکنان' }).boundingBox();
      const activeLinkBox = await activeInventoryLink.boundingBox();
      expect(navBox).not.toBeNull();
      expect(activeLinkBox).not.toBeNull();
      expect(activeLinkBox!.x).toBeGreaterThanOrEqual(navBox!.x);
      expect(activeLinkBox!.x + activeLinkBox!.width).toBeLessThanOrEqual(
        navBox!.x + navBox!.width,
      );
    }
    const rateDisclosure = page.locator('.staff-inventory__rate-disclosure > summary');
    await expect(rateDisclosure).toBeVisible();
    await expect(rateDisclosure).toHaveAccessibleName('تنظیم نرخ شبانه');
    const rateEditorPrecedesOverview = await page
      .locator('.staff-inventory__rate-disclosure')
      .evaluate((disclosure) => {
        const overview = document.querySelector('.staff-inventory__overview');
        return Boolean(
          overview &&
          disclosure.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      });
    expect(rateEditorPrecedesOverview).toBe(true);
    await rateDisclosure.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('نرخ یک شب (تومان)')).toBeVisible();
    if (isNarrowViewport) {
      await expect(page.locator('.staff-inventory__night-cards')).toBeVisible();
      await expect(table).not.toBeVisible();
    } else {
      await expect(table).toBeVisible();
    }
    const roomType = page.getByRole('combobox', { name: 'نوع اتاق' });
    await expect(roomType).toHaveValue(/.+/);
    const roomTypesPayload: unknown = await roomTypesResponse.json();
    if (!Array.isArray(roomTypesPayload)) {
      throw new Error('The inventory room-type options returned an invalid response.');
    }
    const activeRoomTypes = roomTypesPayload.filter(
      (option): option is Record<string, unknown> =>
        isRecord(option) &&
        option.isActive === true &&
        typeof option.id === 'string' &&
        typeof option.name === 'string' &&
        typeof option.slug === 'string',
    );
    if (activeRoomTypes.length === 0) {
      throw new Error('The inventory page had no active room type options.');
    }
    const defaultStartDate = toGregorianIso(await page.getByLabel('شروع بازه').inputValue());
    const defaultEndDate = toGregorianIso(await page.getByLabel('پایان بازه').inputValue());
    if (!defaultStartDate || !defaultEndDate) {
      throw new Error('The default inventory date range was invalid.');
    }
    let roomTypeId: string | undefined;
    let startDate: string | undefined;
    for (const option of activeRoomTypes) {
      const candidateNight = await findPricedProjectedNight(
        page,
        option.id as string,
        defaultStartDate,
        staffCookies,
      );
      if (!candidateNight) continue;
      roomTypeId = option.id as string;
      startDate = candidateNight;
      break;
    }
    if (!roomTypeId || !startDate) {
      throw new Error('No active room type had priced projected inventory in the next 90 nights.');
    }
    await roomType.selectOption(roomTypeId);
    await expect(roomType).toHaveValue(roomTypeId);
    const endDate = addUtcDays(startDate, 1);
    const jalaliStartDate = formatGregorianAsJalali(startDate);
    const jalaliEndDate = formatGregorianAsJalali(endDate);
    if (!jalaliStartDate || !jalaliEndDate) {
      throw new Error('The selected priced inventory night could not be formatted for the editor.');
    }
    await page.getByLabel('شروع بازه').fill(jalaliStartDate);
    await page.getByLabel('پایان بازه').fill(jalaliEndDate);
    const selectedRangeResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/v1/staff/inventory' &&
        response.request().method() === 'GET' &&
        url.searchParams.get('roomTypeId') === roomTypeId &&
        url.searchParams.get('startDate') === startDate &&
        url.searchParams.get('endDate') === endDate
      );
    });
    await page.getByRole('button', { name: 'نمایش بازه' }).click();
    const selectedRangeResponse = await selectedRangeResponsePromise;
    expect(selectedRangeResponse.status()).toBe(200);
    const snapshot = await readInventorySnapshot(
      page,
      roomTypeId,
      startDate,
      endDate,
      staffCookies,
    );
    await rateDisclosure.click();
    const nightlyRate = page.getByLabel('نرخ یک شب (تومان)');
    await expect(nightlyRate).toBeVisible();
    let saveAttempted = false;
    registerCleanup(async () => {
      if (saveAttempted) await restoreInventorySnapshot(page, snapshot, staffCookies);
    });

    await expect(page.getByLabel('ظرفیت کل اتاق‌ها')).toHaveCount(0);
    const firstNight = snapshot.nights[0];
    if (!firstNight || !isPricedProjectedNight(firstNight)) {
      throw new Error('The selected inventory night did not have priced projected capacity.');
    }
    const roomResponse = await page.request.get(
      `${apiBaseUrl}/staff/rooms?roomTypeId=${encodeURIComponent(roomTypeId)}`,
      { headers: await currentStaffHeaders(page, staffCookies) },
    );
    expect(roomResponse.ok()).toBe(true);
    const roomPayload: unknown = await roomResponse.json();
    if (!isRecord(roomPayload) || !Array.isArray(roomPayload.items)) {
      throw new Error('Physical room lookup returned an invalid response.');
    }
    const activeRoomCount = roomPayload.items.filter(
      (room) => isRecord(room) && room.isActive === true,
    ).length;
    const format = (value: number | bigint) => new Intl.NumberFormat('fa-IR').format(value);
    expect(firstNight.totalRooms + firstNight.blockedRooms).toBe(activeRoomCount);
    const firstNightCard = page
      .locator('.staff-inventory__night-card')
      .filter({ has: page.locator(`time[datetime="${firstNight.stayDate}"]`) });
    if (isNarrowViewport) {
      const metrics = firstNightCard.locator('dl > div');
      await expect(metrics.nth(0).locator('dd')).toHaveText(
        format(firstNight.totalRooms + firstNight.blockedRooms),
      );
      await expect(metrics.nth(1).locator('dd')).toHaveText(format(firstNight.blockedRooms));
      await expect(metrics.nth(2).locator('dd')).toHaveText(format(firstNight.heldRooms));
      await expect(metrics.nth(3).locator('dd')).toHaveText(format(firstNight.bookedRooms));
      await expect(metrics.nth(4).locator('dd')).toHaveText(format(firstNight.availableRooms));
      await expect(metrics.nth(5).locator('dd')).toContainText(
        format(BigInt(firstNight.nightlyPriceToman)),
      );
    } else {
      const cells = table.getByRole('row').nth(1).getByRole('cell');
      await expect(cells.nth(0)).toHaveText(
        format(firstNight.totalRooms + firstNight.blockedRooms),
      );
      await expect(cells.nth(1)).toHaveText(format(firstNight.blockedRooms));
      await expect(cells.nth(2)).toHaveText(format(firstNight.heldRooms));
      await expect(cells.nth(3)).toHaveText(format(firstNight.bookedRooms));
      await expect(cells.nth(4)).toHaveText(format(firstNight.availableRooms));
      await expect(cells.nth(5)).toContainText(format(BigInt(firstNight.nightlyPriceToman)));
    }
    await page.screenshot({
      path: testInfo.outputPath('staff-inventory.png'),
      fullPage: true,
    });

    const nextPrice = (BigInt(firstNight.nightlyPriceToman) + BigInt('1000')).toString();
    await expect(nightlyRate).toBeVisible();
    await nightlyRate.fill(nextPrice);
    const updateRequestPromise = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === '/api/v1/staff/inventory' && request.method() === 'PUT';
    });
    const updateResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/staff/inventory' && response.request().method() === 'PUT';
    });
    saveAttempted = true;
    await page.getByRole('button', { name: 'ذخیره برای همه شب‌ها' }).click();
    const updateRequest = await updateRequestPromise;
    expect(updateRequest.postDataJSON()).toEqual({
      roomTypeId,
      startDate,
      endDate,
      nightlyPriceToman: nextPrice,
    });
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status()).toBe(200);

    await expect(page.getByRole('status')).toContainText('نرخ');
    if (isNarrowViewport) {
      const metrics = firstNightCard.locator('dl > div');
      await expect(metrics.nth(0).locator('dd')).toHaveText(
        format(firstNight.totalRooms + firstNight.blockedRooms),
      );
      await expect(metrics.nth(5).locator('dd')).toContainText(format(BigInt(nextPrice)));
    } else {
      const cells = table.getByRole('row').nth(1).getByRole('cell');
      await expect(cells.nth(0)).toHaveText(
        format(firstNight.totalRooms + firstNight.blockedRooms),
      );
      await expect(cells.nth(5)).toContainText(format(BigInt(nextPrice)));
    }

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

test('pending holds remain visible while inventory capacity stays derived and read-only', async ({
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
    const inventorySnapshot = await readInventorySnapshot(
      page,
      roomTypeId,
      checkIn,
      checkOut,
      staffCookies,
    );
    const inventoryTable = page.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
    const isNarrowViewport = (page.viewportSize()?.width ?? 0) <= 760;
    const rows = inventoryTable.getByRole('row');
    if (isNarrowViewport) {
      await expect(page.locator('.staff-inventory__night-cards')).toBeVisible();
      await expect(inventoryTable).not.toBeVisible();
    } else {
      await expect(rows).toHaveCount(3);
    }
    await expect(page.getByLabel('ظرفیت کل اتاق‌ها')).toHaveCount(0);
    const capacityNights = inventorySnapshot.nights.map(requireProjectedCapacityNight);
    expect(capacityNights).toHaveLength(2);
    expect(capacityNights.every((night) => night.heldRooms >= 1)).toBe(true);
    if (isNarrowViewport) {
      for (const night of capacityNights) {
        const card = page
          .locator('.staff-inventory__night-card')
          .filter({ has: page.locator(`time[datetime="${night.stayDate}"]`) });
        await expect(card.locator('dl > div').nth(0).locator('dd')).toHaveText(
          new Intl.NumberFormat('fa-IR').format(night.totalRooms + night.blockedRooms),
        );
        await expect(card.locator('dl > div').nth(2).locator('dd')).toHaveText(
          new Intl.NumberFormat('fa-IR').format(night.heldRooms),
        );
      }
    } else {
      for (const rowIndex of [1, 2]) {
        await expect(rows.nth(rowIndex).getByRole('cell').nth(2)).toContainText(/[۱-۹]/);
      }
      await expect(rows.nth(1).getByRole('cell').nth(0)).toHaveText(
        new Intl.NumberFormat('fa-IR').format(
          capacityNights[0]!.totalRooms + capacityNights[0]!.blockedRooms,
        ),
      );
    }
  });
});

test('receptionist does not see or request the admin inventory editor', async ({ page }) => {
  let roomTypeRequestCount = 0;
  let roomListRequestCount = 0;
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
  await page.route(`${apiBaseUrl}/staff/rooms*`, (route) => {
    roomListRequestCount += 1;
    return route.continue();
  });

  await page.goto('/staff');
  await expect(page.getByRole('link', { name: /^ظرفیت و نرخ‌ها/ })).toHaveCount(0);
  await page.goto('/staff/inventory');
  await expect(page.getByRole('heading', { name: 'دسترسی به مدیریت موجودی' })).toBeVisible();
  await expect(page.getByLabel('نوع اتاق')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ذخیره برای همه شب‌ها' })).toHaveCount(0);
  expect(roomTypeRequestCount).toBe(0);
  await page.goto('/staff/rooms/manage');
  await expect(page.getByRole('heading', { name: 'دسترسی به مدیریت اتاق‌ها' })).toBeVisible();
  expect(roomListRequestCount).toBe(0);
});

test('inventory editor remains keyboard reachable on mobile', async ({ page }) => {
  await page.goto('/staff/inventory');
  const rateDisclosure = page.locator('.staff-inventory__rate-disclosure > summary');
  await expect(rateDisclosure).toBeVisible();
  await expect(rateDisclosure).toHaveAccessibleName('تنظیم نرخ شبانه');
  await rateDisclosure.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('نرخ یک شب (تومان)')).toBeVisible();
  const table = page.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
  if ((page.viewportSize()?.width ?? 0) <= 760) {
    await expect(page.locator('.staff-inventory__night-cards')).toBeVisible();
    await expect(table).not.toBeVisible();
  } else {
    await expect(table).toBeVisible();
  }

  const focusedIds: string[] = [];
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press('Tab');
    focusedIds.push(await page.evaluate(() => (document.activeElement as HTMLElement).id));
  }

  expect(focusedIds).toContain('staff-inventory-room-type');
  expect(focusedIds).toContain('staff-inventory-start-date');
  expect(focusedIds).toContain('staff-inventory-end-date');
  expect(focusedIds).toContain('staff-inventory-nightly-price');
});

test('keeps each rate amount and toman label on one line at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/staff/inventory');

  const rateDisclosure = page.locator('.staff-inventory__rate-disclosure > summary');
  await expect(rateDisclosure).toBeVisible();
  await rateDisclosure.click();
  await page.getByLabel('نرخ یک شب (تومان)').fill('2500000');

  const moneyGroups = page.locator('.staff-inventory__money');
  await expect(moneyGroups).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const amount = await moneyGroups
      .nth(index)
      .locator('.staff-inventory__money-amount')
      .boundingBox();
    const unit = await moneyGroups.nth(index).locator('.staff-inventory__money-unit').boundingBox();
    expect(amount).not.toBeNull();
    expect(unit).not.toBeNull();
    const verticalOverlap =
      Math.min(amount!.y + amount!.height, unit!.y + unit!.height) - Math.max(amount!.y, unit!.y);
    expect(verticalOverlap).toBeGreaterThan(0);
  }
});
