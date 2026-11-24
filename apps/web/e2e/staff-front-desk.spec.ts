import { randomInt } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { isAvailabilityResult } from '../src/lib/availability';
import { test, withFailureSafeCleanup, withStaffWalkInCleanup } from './staff-fixtures';
import { createHousekeepingStaffSession } from './housekeeping-fixtures';
import { prepareReleaseScreenshot, releaseScreenshotStyle } from './release-screenshot';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
}

function nextIsoDate(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function currentBusinessDate(page: Page): Promise<string> {
  const response = await page.request.get(`${apiBaseUrl}/staff/rooms/board`);
  expect(response.status()).toBe(200);
  const board: unknown = await response.json();
  if (!isRecord(board) || typeof board.businessDate !== 'string') {
    throw new Error('The staff room board did not return the current hotel business date.');
  }
  return board.businessDate;
}

test('staff can move through arrival, in-house, and read-only departure queues', async ({
  page,
  staffCookies,
}, testInfo) => {
  await page.context().addCookies(staffCookies);

  await page.goto('/staff/front-desk/arrivals');
  await expect(page.getByRole('heading', { name: 'ورودهای مهمانان' })).toBeVisible();
  const queueNavigation = page.getByRole('navigation', { name: 'فهرست‌های پذیرش' });
  await expect(queueNavigation.getByRole('link', { name: 'ورودها' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('button', { name: 'دریافت دوباره' })).toBeVisible();
  if (testInfo.project.name === 'mobile-chrome') await expectNoHorizontalOverflow(page);
  await prepareReleaseScreenshot(page);
  await page.screenshot({
    path: testInfo.outputPath('front-desk-arrivals.png'),
    fullPage: true,
    style: releaseScreenshotStyle,
  });

  await queueNavigation.getByRole('link', { name: 'مهمانان حاضر' }).click();
  await expect(page).toHaveURL(/\/staff\/front-desk\/in-house$/);
  await expect(page.getByRole('heading', { name: 'مهمانان حاضر' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'دریافت دوباره' })).toBeVisible();
  if (testInfo.project.name === 'mobile-chrome') await expectNoHorizontalOverflow(page);
  await prepareReleaseScreenshot(page);
  await page.screenshot({
    path: testInfo.outputPath('front-desk-in-house.png'),
    fullPage: true,
    style: releaseScreenshotStyle,
  });

  await page
    .getByRole('navigation', { name: 'فهرست‌های پذیرش' })
    .getByRole('link', { name: 'موعدهای خروج' })
    .click();
  await expect(page).toHaveURL(/\/staff\/front-desk\/departures$/);
  await expect(page.getByRole('heading', { name: 'موعدهای خروج' })).toBeVisible();
  await expect(page.getByText(/موعد خروجی ثبت نشده|موعدهای رسیده/)).toBeVisible();
  await expect(page.getByRole('button', { name: /ثبت خروج|تسویه/ })).toHaveCount(0);
  if (testInfo.project.name === 'mobile-chrome') await expectNoHorizontalOverflow(page);
  await prepareReleaseScreenshot(page);
  await page.screenshot({
    path: testInfo.outputPath('front-desk-departures.png'),
    fullPage: true,
    style: releaseScreenshotStyle,
  });

  if (testInfo.project.name === 'mobile-chrome') {
    await page.setViewportSize({ width: 320, height: 844 });
    for (const [path, heading] of [
      ['/staff/front-desk/arrivals', 'ورودهای مهمانان'],
      ['/staff/front-desk/in-house', 'مهمانان حاضر'],
      ['/staff/front-desk/departures', 'موعدهای خروج'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.getByRole('button', { name: 'دریافت دوباره' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  }
});

test('staff records a walk-in from the arrivals workspace', async ({
  page,
  browser,
  request,
  staffCookies,
}, testInfo) => {
  await page.context().addCookies(staffCookies);
  await withFailureSafeCleanup(async (registerCleanup) => {
    const receptionist = await createHousekeepingStaffSession(
      page,
      browser,
      'RECEPTIONIST',
      registerCleanup,
      'HPM010',
    );
    const staffPage = receptionist.page;
    const guestPhone = `+98915${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
    const businessDate = await currentBusinessDate(staffPage);
    const checkOut = nextIsoDate(businessDate);
    const availabilityResponse = await request.get(
      `${apiBaseUrl}/availability?${new URLSearchParams({ checkIn: businessDate, checkOut, guests: '1' })}`,
    );
    expect(availabilityResponse.ok()).toBe(true);
    const availability: unknown = await availabilityResponse.json();
    expect(isAvailabilityResult(availability)).toBe(true);
    if (!isAvailabilityResult(availability))
      throw new Error('Walk-in preflight returned invalid availability.');
    const availableRoomType = availability.roomTypes.find(
      (room) => room.isAvailable && room.availableRooms > 0,
    );
    expect(availableRoomType).toBeDefined();
    if (!availableRoomType)
      throw new Error('No room type has capacity for the current business date.');

    await withStaffWalkInCleanup(staffPage, guestPhone, [], async (markBookingCreated) => {
      await staffPage.goto('/staff/front-desk/arrivals');
      await expect(staffPage.getByRole('heading', { name: 'ورودهای مهمانان' })).toBeVisible();
      const walkInButton = staffPage.getByRole('button', { name: 'ثبت ورود بدون رزرو قبلی' });
      await expect(walkInButton).toBeEnabled();
      await walkInButton.click();

      const dialog = staffPage.getByRole('dialog', { name: 'ثبت ورود بدون رزرو قبلی' });
      await expect(dialog).toBeVisible();
      await staffPage.getByLabel('نام مهمان').fill('مهمان آزمایشی پذیرش');
      await staffPage.getByLabel('شماره تماس').fill(guestPhone);
      const roomType = staffPage.getByLabel('نوع اتاق');
      await roomType.selectOption(availableRoomType.slug);
      await staffPage.getByLabel('تعداد مهمانان').fill('1');
      await staffPage.getByLabel('تعداد اتاق').fill('1');

      markBookingCreated();
      await dialog.getByRole('button', { name: 'ثبت ورود قطعی' }).click();
      const confirmation = staffPage.getByRole('status').filter({ hasText: 'ورود حضوری ثبت شد' });
      await expect(confirmation).toBeVisible();
      const reference = (await confirmation.textContent())?.match(/[A-Za-z0-9_-]{12,16}/)?.[0];
      if (!reference)
        throw new Error('The walk-in confirmation did not expose a booking reference.');
      markBookingCreated(reference);
      await confirmation.screenshot({
        path: testInfo.outputPath('hpm010-walk-in-confirmation.png'),
        style: releaseScreenshotStyle,
      });
    });
  });
});
