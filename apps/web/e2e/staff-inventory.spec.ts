import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { toGregorianIso } from '../src/lib/jalali-date';
import { findAvailableGardenStay } from './available-stay';
import { test } from './staff-fixtures';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4016';
const apiBaseUrl = `http://localhost:${apiPort}/api/v1`;

test.beforeEach(async ({ page, staffCookies }) => {
  await page.context().addCookies(staffCookies);
});

test('admin can inspect and batch-save inventory, and the page meets axe checks', async ({
  page,
}) => {
  await page.goto('/staff/inventory');

  const table = page.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
  await expect(table).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'نوع اتاق' })).toHaveValue(/.+/);

  const capacity = page.getByLabel('ظرفیت کل اتاق‌ها');
  const originalCapacity = Number(await capacity.inputValue());
  expect(Number.isSafeInteger(originalCapacity)).toBe(true);
  await capacity.fill(String(originalCapacity + 1));
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

test('inventory editor rejects capacity below a real pending booking hold', async ({
  page,
  request,
}, testInfo) => {
  const stay = await findAvailableGardenStay(request, testInfo);
  const checkIn = toGregorianIso(stay.checkInJalali);
  const checkOut = toGregorianIso(stay.checkOutJalali);
  if (!checkIn || !checkOut) throw new Error('The available stay dates were invalid.');

  const bookingResponse = await request.post(`${apiBaseUrl}/bookings`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: {
      roomTypeSlug: 'garden-double',
      checkIn,
      checkOut,
      guestCount: 2,
      roomQuantity: 1,
      guestName: 'مریم رضایی؛ آزمون موجودی HBE-020',
      guestPhone: '+989120000020',
      guestEmail: 'hbe020-oversell@example.test',
    },
  });
  expect(bookingResponse.status()).toBe(201);
  const booking = (await bookingResponse.json()) as { reference?: unknown };
  if (typeof booking.reference !== 'string') {
    throw new Error('The pending inventory fixture did not return a booking reference.');
  }

  try {
    await page.goto('/staff/inventory');
    const roomType = page.getByRole('combobox', { name: 'نوع اتاق' });
    await roomType.selectOption({ label: 'اتاق دوتخته باغ' });
    await page.getByLabel('شروع بازه').fill(stay.checkInJalali);
    await page.getByLabel('پایان بازه').fill(stay.checkOutJalali);
    await page.getByRole('button', { name: 'نمایش بازه' }).click();

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
  } finally {
    const csrfToken = (await page.context().cookies(`${apiBaseUrl}/staff`)).find(
      (cookie) => cookie.name === 'hotel_staff_csrf',
    )?.value;
    if (!csrfToken) throw new Error('The staff session did not have a current CSRF token.');
    const cleanupResponse = await page.request.post(
      `${apiBaseUrl}/staff/bookings/${encodeURIComponent(booking.reference)}/reject`,
      {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { internalNote: 'HBE-020 fictional inventory fixture cleanup.' },
      },
    );
    expect(cleanupResponse.status()).toBe(200);
    expect(await cleanupResponse.json()).toMatchObject({
      reference: booking.reference,
      status: 'REJECTED',
    });
  }
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
