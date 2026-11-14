import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(webRoot, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [resolve(webRoot, './src/test/setup.ts')],
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    maxWorkers: 1,
    isolate: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/availability.ts',
        'src/lib/booking-form-schema.ts',
        'src/lib/jalali-date.ts',
        'src/lib/staff-inventory.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: resolve(webRoot, './coverage'),
      thresholds: {
        statements: 88,
        branches: 80,
        functions: 95,
        lines: 90,
      },
    },
  },
});
