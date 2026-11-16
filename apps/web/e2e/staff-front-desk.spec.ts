import { expect, type Page } from '@playwright/test';
import { test } from './staff-fixtures';

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
}

test('staff can move through arrival, in-house, and read-only departure queues', async (
  { page, staffCookies },
  testInfo,
) => {
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
  await page.screenshot({
    path: testInfo.outputPath('front-desk-arrivals.png'),
    fullPage: true,
  });

  await queueNavigation.getByRole('link', { name: 'مهمانان حاضر' }).click();
  await expect(page).toHaveURL(/\/staff\/front-desk\/in-house$/);
  await expect(page.getByRole('heading', { name: 'مهمانان حاضر' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'دریافت دوباره' })).toBeVisible();
  if (testInfo.project.name === 'mobile-chrome') await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('front-desk-in-house.png'),
    fullPage: true,
  });

  await page.getByRole('navigation', { name: 'فهرست‌های پذیرش' })
    .getByRole('link', { name: 'موعدهای خروج' })
    .click();
  await expect(page).toHaveURL(/\/staff\/front-desk\/departures$/);
  await expect(page.getByRole('heading', { name: 'موعدهای خروج' })).toBeVisible();
  await expect(page.getByText(/موعد خروجی ثبت نشده|موعدهای رسیده/)).toBeVisible();
  await expect(page.getByRole('button', { name: /ثبت خروج|تسویه/ })).toHaveCount(0);
  if (testInfo.project.name === 'mobile-chrome') await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('front-desk-departures.png'),
    fullPage: true,
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
