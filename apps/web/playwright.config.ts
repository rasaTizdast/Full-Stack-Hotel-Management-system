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
    baseURL: 'http://localhost:3000',
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
      url: 'http://127.0.0.1:4000/health/ready',
      reuseExistingServer,
      timeout: 120_000,
      env: { NODE_ENV: 'test' },
    },
    {
      command: 'pnpm --filter @hotel/web dev',
      cwd: workspaceRoot,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer,
      timeout: 120_000,
      env: {
        HOTEL_API_BASE_URL: 'http://127.0.0.1:4000/api/v1',
      },
    },
  ],
});
