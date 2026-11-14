import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const releaseGates = [
  { label: 'Workspace formatting', args: ['format:check'] },
  { label: 'Workspace lint', args: ['lint'] },
  { label: 'Workspace type checks', args: ['typecheck'] },
  { label: 'Workspace unit tests', args: ['test'] },
  {
    label: 'API PostgreSQL migrations, integration, and coverage',
    args: ['--filter', '@hotel/api', 'test:coverage'],
  },
  { label: 'API fictional demo seed', args: ['--filter', '@hotel/api', 'prisma:seed'] },
  { label: 'Web coverage', args: ['--filter', '@hotel/web', 'test:coverage'] },
  { label: 'Playwright desktop and mobile', args: ['--filter', '@hotel/web', 'test:e2e'] },
  { label: 'API e2e and OpenAPI contract', args: ['--filter', '@hotel/api', 'test:e2e'] },
  { label: 'Workspace production builds', args: ['build'] },
];

for (const [index, gate] of releaseGates.entries()) {
  const command = `pnpm ${gate.args.join(' ')}`;
  process.stdout.write(`\n[${index + 1}/${releaseGates.length}] ${gate.label}\n$ ${command}\n`);

  const result = spawnSync(pnpm, gate.args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.stderr.write(
      `Release gate failed: ${gate.label}; command: ${command}; exit code: ${result.status ?? 1}\n`,
    );
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nAll release gates passed.\n');
