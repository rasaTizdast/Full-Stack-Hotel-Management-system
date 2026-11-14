import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function assertIsolatedDatabase(envPath: string): void {
  const content = readFileSync(envPath, 'utf8');
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trimStart().startsWith('DATABASE_URL='));
  const databaseUrl = line
    ?.slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (!databaseUrl || !new URL(databaseUrl).pathname.slice(1).endsWith('_test')) {
    throw new Error(
      'Playwright requires DATABASE_URL to name an isolated database ending in _test.',
    );
  }
}

export default async function globalSetup(): Promise<void> {
  const workspaceRoot = resolve(process.cwd(), '../..');
  assertIsolatedDatabase(resolve(workspaceRoot, '.env'));
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const execution = {
    cwd: workspaceRoot,
    stdio: 'inherit' as const,
    shell: process.platform === 'win32',
  };

  execFileSync(pnpm, ['--filter', '@hotel/api', 'prisma:generate'], execution);
  execFileSync(pnpm, ['--filter', '@hotel/api', 'prisma:migrate:deploy'], execution);
  execFileSync(pnpm, ['--filter', '@hotel/api', 'prisma:seed'], execution);
}
