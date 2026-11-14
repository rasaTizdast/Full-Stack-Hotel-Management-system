import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { ensureTestDatabaseExists, validateTestDatabaseUrl } from './prepare-test-database.js';

loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });

async function prepareTestDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  validateTestDatabaseUrl(databaseUrl);
  await ensureTestDatabaseExists(databaseUrl);

  const migration = spawnSync('pnpm', ['prisma:migrate:deploy'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
  });

  if (migration.error) {
    throw migration.error;
  }
  if (migration.status !== 0) {
    throw new Error(`Prisma migration deployment failed: ${migration.stderr}`);
  }

  process.stdout.write(migration.stdout);
  process.stderr.write(migration.stderr);
}

prepareTestDatabase().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
