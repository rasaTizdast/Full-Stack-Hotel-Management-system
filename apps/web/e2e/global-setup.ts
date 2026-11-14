import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getIsolatedTestDatabaseUrl } from '../src/lib/test-database-url';

export default async function globalSetup(): Promise<void> {
  const workspaceRoot = resolve(process.cwd(), '../..');
  const envContent = readFileSync(resolve(workspaceRoot, '.env'), 'utf8');
  const databaseUrl = getIsolatedTestDatabaseUrl(envContent, process.env.DATABASE_URL);
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const execution = {
    cwd: workspaceRoot,
    stdio: 'inherit' as const,
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  };

  execFileSync(pnpm, ['--filter', '@hotel/api', 'prisma:generate'], execution);
  execFileSync(pnpm, ['--filter', '@hotel/api', 'prisma:migrate:deploy'], execution);
  execFileSync(pnpm, ['--filter', '@hotel/api', 'prisma:seed'], execution);
}
