import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const workspaceRoot = resolve(process.cwd(), '../..');
const webPort = process.env.HBE_E2E_WEB_PORT ?? '3015';
const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const webOrigin = `http://localhost:${webPort}`;
const apiBaseUrl = `http://localhost:${apiPort}/api/v1`;
const reuseExistingServer = process.env.HBE_E2E_REUSE_SERVER === 'true';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  outputDir: resolve(workspaceRoot, 'output/playwright'),
  fullyParallel: true,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['iPhone 13'], browserName: 'chromium', channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @hotel/api dev',
      cwd: workspaceRoot,
      url: `http://localhost:${apiPort}/health/ready`,
      reuseExistingServer,
      timeout: 120_000,
      env: { NODE_ENV: 'test', PORT: apiPort, WEB_ORIGIN: webOrigin },
    },
    {
      command: 'pnpm --filter @hotel/web dev',
      cwd: workspaceRoot,
      url: webOrigin,
      reuseExistingServer,
      timeout: 120_000,
      env: {
        PORT: webPort,
        HOTEL_API_BASE_URL: apiBaseUrl,
        NEXT_PUBLIC_HOTEL_API_BASE_URL: apiBaseUrl,
      },
    },
  ],
});
