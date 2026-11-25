import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, request } from '@playwright/test';

const webOrigin = process.env.DEMO_WEB_ORIGIN ?? 'http://localhost:3000';
const apiBaseUrl = process.env.DEMO_API_BASE_URL ?? 'http://localhost:4000/api/v1';
const checkInDate = new Date();
checkInDate.setUTCDate(checkInDate.getUTCDate() + 7);
const checkOutDate = new Date(checkInDate);
checkOutDate.setUTCDate(checkOutDate.getUTCDate() + 2);
const checkIn = checkInDate.toISOString().slice(0, 10);
const checkOut = checkOutDate.toISOString().slice(0, 10);

async function envValue(name) {
  if (process.env[name]) return process.env[name];
  const envPath = resolve(process.cwd(), '../../.env');
  const content = await readFile(envPath, 'utf8');
  const assignment = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${name}=`));
  if (!assignment) return undefined;
  return assignment
    .slice(assignment.indexOf('=') + 1)
    .trim()
    .replace(/^(?:"(.*)"|'(.*)')$/, (_match, doubleQuoted, singleQuoted) => {
      return doubleQuoted ?? singleQuoted;
    });
}

async function revealPage(page) {
  const { step, height } = await page.evaluate(() => ({
    step: Math.max(window.innerHeight * 0.75, 1),
    height: document.documentElement.scrollHeight,
  }));

  for (let top = 0; top < height; top += step) {
    await page.evaluate(
      (scrollTop) => window.scrollTo({ top: scrollTop, behavior: 'instant' }),
      top,
    );
    await page.waitForTimeout(90);
  }

  await page.waitForFunction(
    () => [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    null,
    { timeout: 20000 },
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(850);
}

async function suppressFrameworkOverlay(page) {
  await page.addStyleTag({
    content:
      'nextjs-portal, .skip-link { display: none !important; visibility: hidden !important; }',
  });
  await page.evaluate(() => {
    const removePortal = () => {
      document.querySelectorAll('nextjs-portal').forEach((element) => element.remove());
    };
    removePortal();
    new MutationObserver(removePortal).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

const email = await envValue('DEMO_ADMIN_EMAIL');
const password = await envValue('DEMO_ADMIN_PASSWORD');
if (!email || !password) {
  throw new Error('Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD in the local environment.');
}

const outputDirectory = resolve(process.cwd(), '../../docs/screenshots');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.DEMO_BROWSER_EXECUTABLE || undefined,
});
const publicContext = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  locale: 'fa-IR',
});
const publicPage = await publicContext.newPage();
const authContext = await request.newContext();
let staffContext;
let staffLoginSucceeded = false;
let captureFailed = false;
let captureError;
const cleanupErrors = [];

try {
  await publicPage.goto(webOrigin, { waitUntil: 'domcontentloaded' });
  await suppressFrameworkOverlay(publicPage);
  await publicPage.evaluate(() => document.fonts.ready);
  await publicPage.addStyleTag({
    content:
      'nextjs-portal, .skip-link { display: none !important; visibility: hidden !important; }',
  });
  await publicPage.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await publicPage.mouse.move(1439, 0);
  await revealPage(publicPage);
  await publicPage.screenshot({
    path: resolve(outputDirectory, 'public-home.png'),
    fullPage: true,
  });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.waitForTimeout(150);
  await publicPage.screenshot({ path: resolve(outputDirectory, 'public-home-mobile.png') });
  await publicPage.setViewportSize({ width: 1440, height: 960 });

  await publicPage.getByRole('button', { name: 'بررسی اتاق‌های موجود' }).click();
  const resultsHeading = publicPage.getByRole('heading', { name: 'اتاق‌های مناسب شما' });
  await resultsHeading.waitFor();
  await publicPage.evaluate(() => document.fonts.ready);
  await publicPage.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await publicPage.mouse.move(1439, 0);
  await revealPage(publicPage);
  await publicPage.screenshot({
    path: resolve(outputDirectory, 'public-availability.png'),
    fullPage: true,
  });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.waitForTimeout(150);
  await resultsHeading.evaluate((element) => {
    window.scrollTo({
      top: window.scrollY + element.getBoundingClientRect().top - 24,
      behavior: 'instant',
    });
  });
  await publicPage.screenshot({
    path: resolve(outputDirectory, 'public-results-mobile.png'),
  });
  await publicPage.setViewportSize({ width: 1440, height: 960 });

  await publicPage.goto(`${webOrigin}/rooms/garden-double`, { waitUntil: 'domcontentloaded' });
  await suppressFrameworkOverlay(publicPage);
  await publicPage.getByRole('heading', { name: 'اتاق دوتخته باغ' }).waitFor();
  await publicPage.evaluate(() => document.fonts.ready);
  await revealPage(publicPage);
  await publicPage.screenshot({
    path: resolve(outputDirectory, 'public-room-detail.png'),
    fullPage: true,
  });

  await publicPage.goto(
    `${webOrigin}/booking?roomType=garden-double&checkIn=${checkIn}&checkOut=${checkOut}&guestCount=2`,
    { waitUntil: 'domcontentloaded' },
  );
  await suppressFrameworkOverlay(publicPage);
  await publicPage.getByRole('heading', { name: 'درخواست اقامت' }).waitFor();
  await publicPage.evaluate(() => document.fonts.ready);
  await revealPage(publicPage);
  await publicPage
    .locator('img[src*="garden-double"]')
    .first()
    .evaluate((image) => image.decode());
  await publicPage.screenshot({
    path: resolve(outputDirectory, 'public-booking.png'),
    fullPage: false,
  });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.getByRole('form', { name: 'فرم درخواست اقامت' }).evaluate((element) => {
    window.scrollTo({
      top: window.scrollY + element.getBoundingClientRect().top - 20,
      behavior: 'instant',
    });
  });
  await publicPage.screenshot({
    path: resolve(outputDirectory, 'public-booking-mobile.png'),
  });
  await publicPage.setViewportSize({ width: 1440, height: 960 });

  await publicPage.goto(`${webOrigin}/staff/login`, { waitUntil: 'domcontentloaded' });
  await suppressFrameworkOverlay(publicPage);
  await publicPage.getByRole('heading', { name: 'به پنل خوش آمدید' }).waitFor();
  await publicPage.evaluate(() => document.fonts.ready);
  await revealPage(publicPage);
  await publicPage.screenshot({
    path: resolve(outputDirectory, 'staff-login.png'),
    fullPage: true,
  });

  const login = await authContext.post(`${apiBaseUrl}/staff/auth/login`, {
    headers: {
      Origin: webOrigin,
      Referer: `${webOrigin}/staff/login`,
    },
    data: { email, password },
  });
  if (login.status() !== 200) {
    throw new Error(`The development staff login returned HTTP ${login.status()}.`);
  }
  staffLoginSucceeded = true;

  const state = await authContext.storageState();
  staffContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: 'fa-IR',
  });
  await staffContext.addCookies(state.cookies);
  const staffPage = await staffContext.newPage();
  await staffPage.goto(`${webOrigin}/staff/inventory`, { waitUntil: 'domcontentloaded' });
  await suppressFrameworkOverlay(staffPage);
  await staffPage.getByRole('navigation', { name: 'منوی پنل کارکنان' }).waitFor();
  await staffPage.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' }).waitFor();
  await staffPage.evaluate(() => document.fonts.ready);
  await staffPage.addStyleTag({
    content:
      'nextjs-portal, .skip-link { display: none !important; visibility: hidden !important; }',
  });
  await staffPage.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await staffPage.mouse.move(1439, 0);
  await revealPage(staffPage);
  await staffPage.screenshot({
    path: resolve(outputDirectory, 'staff-inventory.png'),
    fullPage: true,
  });
  await staffPage.setViewportSize({ width: 390, height: 844 });
  await staffPage.waitForTimeout(150);
  await staffPage.screenshot({ path: resolve(outputDirectory, 'staff-inventory-mobile.png') });

  await staffPage.setViewportSize({ width: 1440, height: 960 });
  await staffPage.goto(`${webOrigin}/staff/bookings`, { waitUntil: 'domcontentloaded' });
  await suppressFrameworkOverlay(staffPage);
  await staffPage.getByRole('heading', { name: 'درخواست‌های اقامت' }).waitFor();
  await revealPage(staffPage);
  await suppressFrameworkOverlay(staffPage);
  await staffPage.screenshot({
    path: resolve(outputDirectory, 'staff-requests.png'),
    fullPage: true,
  });

  process.stdout.write(
    'Wrote desktop and mobile guest, booking, and staff workflow screenshots.\n',
  );
} catch (error) {
  captureFailed = true;
  captureError = error;
} finally {
  if (staffLoginSucceeded) {
    try {
      const currentStaff = await authContext.get(`${apiBaseUrl}/staff/auth/me`, {
        headers: { Origin: webOrigin, Referer: `${webOrigin}/staff` },
      });
      if (!currentStaff.ok()) {
        throw new Error(
          `The development staff session refresh returned HTTP ${currentStaff.status()}.`,
        );
      }
      const session = await currentStaff.json();
      if (!session || typeof session.csrfToken !== 'string' || !session.csrfToken) {
        throw new Error('The development staff session did not return a CSRF token.');
      }
      const logout = await authContext.post(`${apiBaseUrl}/staff/auth/logout`, {
        headers: {
          Origin: webOrigin,
          Referer: `${webOrigin}/staff`,
          'X-CSRF-Token': session.csrfToken,
        },
      });
      if (logout.status() !== 204) {
        throw new Error(`The development staff logout returned HTTP ${logout.status()}.`);
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  for (const cleanup of [
    () => staffContext?.close(),
    () => authContext.dispose(),
    () => publicContext.close(),
    () => browser.close(),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
}

const cleanupError =
  cleanupErrors.length === 0
    ? undefined
    : new AggregateError(cleanupErrors, 'Demo screenshot cleanup failed.');
if (captureFailed && cleanupError) {
  throw new AggregateError(
    [captureError, cleanupError],
    'Demo screenshot capture and cleanup failed.',
  );
}
if (captureFailed) throw captureError;
if (cleanupError) throw cleanupError;
