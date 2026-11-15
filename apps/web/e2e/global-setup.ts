import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getE2eDatabaseUrl } from './test-database';

export default async function globalSetup(): Promise<void> {
  const workspaceRoot = resolve(process.cwd(), '../..');
  const databaseUrl = getE2eDatabaseUrl(workspaceRoot);
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
