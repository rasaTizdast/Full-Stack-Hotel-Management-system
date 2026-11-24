import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function readEnvValue(content, name) {
  const assignments = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => new RegExp(`^${name}\\s*=`).test(line));
  if (assignments.length !== 1) {
    throw new Error(`Expected exactly one ${name} assignment in the root .env file.`);
  }

  const value = assignments[0].slice(assignments[0].indexOf('=') + 1).trim();
  return value.replace(
    /^(?:"(.*)"|'(.*)')$/,
    (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted,
  );
}

function configuredTestDatabaseUrl() {
  const envContent = readFileSync(resolve(workspaceRoot, '.env'), 'utf8');
  const configuredUrl =
    process.env.DATABASE_URL?.trim() || readEnvValue(envContent, 'DATABASE_URL');
  const parsed = new URL(configuredUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*_test$/.test(databaseName)
  ) {
    throw new Error(
      'The configured database must be an isolated PostgreSQL database ending in _test.',
    );
  }

  return parsed.toString();
}

function databaseUrlForName(configuredUrl, databaseName) {
  const parsed = new URL(configuredUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

const runId = randomUUID().replaceAll('-', '').slice(0, 10);
const baseTestDatabaseUrl = configuredTestDatabaseUrl();
const releaseDatabaseUrl = databaseUrlForName(baseTestDatabaseUrl, `hotel_check_${runId}_test`);
const playwrightDatabaseUrl = databaseUrlForName(
  baseTestDatabaseUrl,
  `hotel_playwright_${runId}_test`,
);
const apiE2eDatabaseUrl = databaseUrlForName(baseTestDatabaseUrl, `hotel_api_e2e_${runId}_test`);

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
  {
    label: 'Playwright desktop and mobile',
    args: ['--filter', '@hotel/web', 'test:e2e'],
    isolatedPlaywrightDatabase: true,
  },
  {
    label: 'API e2e and OpenAPI contract',
    args: ['--filter', '@hotel/api', 'test:e2e'],
    isolatedApiE2eDatabase: true,
  },
  { label: 'Workspace production builds', args: ['build'] },
];

for (const [index, gate] of releaseGates.entries()) {
  const command = `pnpm ${gate.args.join(' ')}`;
  process.stdout.write(`\n[${index + 1}/${releaseGates.length}] ${gate.label}\n$ ${command}\n`);

  let gateEnvironment = { ...process.env, DATABASE_URL: releaseDatabaseUrl };
  if (gate.isolatedPlaywrightDatabase || gate.isolatedApiE2eDatabase) {
    const databaseUrl = gate.isolatedPlaywrightDatabase ? playwrightDatabaseUrl : apiE2eDatabaseUrl;
    const preparation = spawnSync(pnpm, ['--filter', '@hotel/api', 'test:database:prepare'], {
      cwd: workspaceRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    if (preparation.error || preparation.status !== 0) {
      if (preparation.error) process.stderr.write(`${preparation.error.message}\n`);
      process.stderr.write(
        `Release gate failed: isolated Playwright database preparation; exit code: ${preparation.status ?? 1}\n`,
      );
      process.exit(preparation.status ?? 1);
    }
    gateEnvironment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ...(gate.isolatedPlaywrightDatabase ? { HBE_E2E_DATABASE_URL: databaseUrl } : {}),
    };
  }

  const result = spawnSync(pnpm, gate.args, {
    cwd: workspaceRoot,
    env: gateEnvironment,
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
