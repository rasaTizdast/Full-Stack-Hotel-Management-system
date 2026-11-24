import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getE2eDatabaseUrl, getE2eEnvironmentValue } from './test-database';

export default async function globalSetup(): Promise<void> {
  const workspaceRoot = resolve(process.cwd(), '../..');
  const databaseUrl = getE2eDatabaseUrl(workspaceRoot);
  const demoAdminEmail =
    process.env.DEMO_ADMIN_EMAIL ?? getE2eEnvironmentValue('DEMO_ADMIN_EMAIL', workspaceRoot);
  const demoAdminPassword =
    process.env.DEMO_ADMIN_PASSWORD ?? getE2eEnvironmentValue('DEMO_ADMIN_PASSWORD', workspaceRoot);
  if (!demoAdminEmail || !demoAdminPassword) {
    throw new Error(
      'Playwright setup requires demo admin credentials in the environment or root .env.',
    );
  }
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const execution = {
    cwd: workspaceRoot,
    stdio: 'inherit' as const,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DEMO_ADMIN_EMAIL: demoAdminEmail,
      DEMO_ADMIN_PASSWORD: demoAdminPassword,
    },
  };

  execFileSync(pnpm, ['--filter', '@hotel/api', 'prisma:generate'], execution);
  execFileSync(pnpm, ['--filter', '@hotel/api', 'prisma:migrate:deploy'], execution);
  execFileSync(pnpm, ['--filter', '@hotel/api', 'prisma:seed'], execution);
}
