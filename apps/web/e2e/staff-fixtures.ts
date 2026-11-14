import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, request as playwrightRequest, test as base } from '@playwright/test';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4016';
const webPort = process.env.HBE_E2E_WEB_PORT ?? '3016';
const apiBaseUrl = `http://localhost:${apiPort}/api/v1`;
const webOrigin = `http://localhost:${webPort}`;

export interface StaffBrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax';
}

interface StaffWorkerFixtures {
  staffCookies: StaffBrowserCookie[];
}

function localEnvValue(name: string): string | undefined {
  const envPath = resolve(process.cwd(), '../../.env');
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trimStart().startsWith(`${name}=`));
  return line
    ?.slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function adminCredentials() {
  const email = process.env.DEMO_ADMIN_EMAIL ?? localEnvValue('DEMO_ADMIN_EMAIL');
  const password = process.env.DEMO_ADMIN_PASSWORD ?? localEnvValue('DEMO_ADMIN_PASSWORD');
  if (!email || !password) {
    throw new Error('Set fictional demo admin credentials in the local .env.');
  }
  return { email, password };
}

function parseStaffCookies(setCookieHeaders: string[]): StaffBrowserCookie[] {
  return setCookieHeaders.flatMap((header) => {
    const [pair, ...attributes] = header.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    if (separator < 1) return [];
    const attributeValue = (name: string) =>
      attributes
        .find((attribute) => attribute.toLowerCase().startsWith(`${name}=`))
        ?.slice(name.length + 1);

    return [
      {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        domain: 'localhost',
        path: attributeValue('path') ?? '/api/v1/staff',
        httpOnly: attributes.some((attribute) => attribute.toLowerCase() === 'httponly'),
        secure: attributes.some((attribute) => attribute.toLowerCase() === 'secure'),
        sameSite: 'Lax' as const,
      },
    ];
  });
}

export const test = base.extend<object, StaffWorkerFixtures>({
  staffCookies: [
    async ({}, use) => {
      const apiContext = await playwrightRequest.newContext();
      let cookies: StaffBrowserCookie[] = [];
      try {
        const response = await apiContext.post(`${apiBaseUrl}/staff/auth/login`, {
          headers: { Origin: webOrigin, Referer: `${webOrigin}/staff/login` },
          data: adminCredentials(),
        });
        expect(response.status()).toBe(200);
        const headers = await response.headersArray();
        cookies = parseStaffCookies(
          headers
            .filter((header) => header.name.toLowerCase() === 'set-cookie')
            .map((header) => header.value),
        );
        expect(cookies.map((cookie) => cookie.name)).toEqual(
          expect.arrayContaining(['hotel_staff_session', 'hotel_staff_csrf']),
        );
      } catch (cause) {
        await apiContext.dispose();
        throw cause;
      }
      await use(cookies);
      await apiContext.dispose();
    },
    { scope: 'worker' },
  ],
});
