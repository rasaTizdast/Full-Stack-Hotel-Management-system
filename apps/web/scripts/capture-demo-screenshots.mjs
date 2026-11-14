import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, request } from '@playwright/test';

const webOrigin = process.env.DEMO_WEB_ORIGIN ?? 'http://localhost:3000';
const apiBaseUrl = process.env.DEMO_API_BASE_URL ?? 'http://localhost:4000/api/v1';

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

const email = await envValue('DEMO_ADMIN_EMAIL');
const password = await envValue('DEMO_ADMIN_PASSWORD');
if (!email || !password) {
  throw new Error('Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD in the local environment.');
}

const outputDirectory = resolve(process.cwd(), '../../docs/screenshots');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
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
  await publicPage.goto(webOrigin, { waitUntil: 'networkidle' });
  await publicPage.evaluate(() => document.fonts.ready);
  await publicPage.addStyleTag({
    content:
      'nextjs-portal, .skip-link { display: none !important; visibility: hidden !important; }',
  });
  await publicPage.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await publicPage.mouse.move(1439, 0);
  await publicPage.screenshot({
    path: resolve(outputDirectory, 'public-home.png'),
    fullPage: true,
  });

  await publicPage.getByRole('button', { name: 'بررسی اتاق‌های موجود' }).click();
  await publicPage.getByRole('heading', { name: 'اتاق‌های مناسب شما' }).waitFor();
  await publicPage.evaluate(() => document.fonts.ready);
  await publicPage.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await publicPage.mouse.move(1439, 0);
  await publicPage.screenshot({
    path: resolve(outputDirectory, 'public-availability.png'),
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
  await staffPage.goto(`${webOrigin}/staff/inventory`, { waitUntil: 'networkidle' });
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
  await staffPage.screenshot({
    path: resolve(outputDirectory, 'staff-inventory.png'),
    fullPage: true,
  });

  process.stdout.write(
    'Wrote public-home.png, public-availability.png, and staff-inventory.png.\n',
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
