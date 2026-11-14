function normalizeIsolatedDatabaseUrl(value: string, source: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${source} must contain a valid PostgreSQL DATABASE_URL.`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error(`${source} must contain a valid PostgreSQL DATABASE_URL.`);
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error(`${source} must contain a valid PostgreSQL database name.`);
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error(`${source} DATABASE_URL must target a database ending in _test.`);
  }
  return parsed.toString();
}

function readEnvDatabaseUrl(envContent: string): string {
  const assignments = envContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^DATABASE_URL\s*=/.test(line));
  if (assignments.length !== 1) {
    throw new Error('Playwright requires exactly one DATABASE_URL in the root .env file.');
  }

  const assignment = assignments[0];
  const value = assignment.slice(assignment.indexOf('=') + 1).trim();
  const unquoted = value.replace(
    /^(?:"(.*)"|'(.*)')$/,
    (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted,
  );
  return normalizeIsolatedDatabaseUrl(unquoted, 'The root .env');
}

export function getIsolatedTestDatabaseUrl(
  envContent: string,
  inheritedDatabaseUrl: string | undefined,
): string {
  const envDatabaseUrl = readEnvDatabaseUrl(envContent);
  if (!inheritedDatabaseUrl?.trim()) return envDatabaseUrl;

  const inherited = normalizeIsolatedDatabaseUrl(
    inheritedDatabaseUrl.trim(),
    'The inherited environment',
  );
  if (inherited !== envDatabaseUrl) {
    throw new Error(
      'The inherited DATABASE_URL must match the isolated database in the root .env file.',
    );
  }
  return envDatabaseUrl;
}
