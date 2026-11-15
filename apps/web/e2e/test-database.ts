import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { getIsolatedTestDatabaseUrl } from '../src/lib/test-database-url';

export interface E2eEnvironment {
  content: string;
  databaseUrl: string;
}

export function readE2eEnvironment(workspaceRoot: string): E2eEnvironment {
  const worktreesDirectory = dirname(workspaceRoot);
  const worktreesName = basename(worktreesDirectory);
  const worktreeSuffix = '-worktrees';
  const mainCheckoutName = worktreesName.endsWith(worktreeSuffix)
    ? worktreesName.slice(0, -worktreeSuffix.length)
    : '';
  const candidates = [
    resolve(workspaceRoot, '.env'),
    ...(mainCheckoutName
      ? [resolve(dirname(worktreesDirectory), mainCheckoutName, '.env')]
      : []),
  ];
  const envPath = candidates.find((candidate) => existsSync(candidate));
  if (!envPath) {
    throw new Error('Playwright requires the local project .env with an isolated test DATABASE_URL.');
  }
  const content = readFileSync(envPath, 'utf8');
  return {
    content,
    databaseUrl: getIsolatedTestDatabaseUrl(
      content,
      process.env.DATABASE_URL,
      process.env.HBE_E2E_DATABASE_URL,
    ),
  };
}

export function getE2eDatabaseUrl(workspaceRoot: string): string {
  return readE2eEnvironment(workspaceRoot).databaseUrl;
}

export function getE2eEnvironmentValue(name: string, workspaceRoot: string): string | undefined {
  const { content } = readE2eEnvironment(workspaceRoot);
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trimStart().startsWith(`${name}=`));
  return line
    ?.slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '');
}
