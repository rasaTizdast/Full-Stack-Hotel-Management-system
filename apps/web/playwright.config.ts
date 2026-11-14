import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const workspaceRoot = resolve(process.cwd(), '../..');
const reuseExistingServer = !process.env.CI;

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
    baseURL: 'http://localhost:3014',
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
      url: 'http://127.0.0.1:4014/health/ready',
      reuseExistingServer,
      timeout: 120_000,
      env: { NODE_ENV: 'test', PORT: '4014' },
    },
    {
      command: 'pnpm --filter @hotel/web exec next dev --port 3014',
      cwd: workspaceRoot,
      url: 'http://localhost:3014/favicon.ico',
      reuseExistingServer,
      timeout: 120_000,
      env: {
        HOTEL_API_BASE_URL: 'http://127.0.0.1:4014/api/v1',
        PORT: '3014',
      },
    },
  ],
});
