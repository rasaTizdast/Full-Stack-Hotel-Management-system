import { Client } from 'pg';

export interface DatabaseAdminClient {
  connect(): Promise<void>;
  query(queryText: string, values?: unknown[]): Promise<{ rows: Array<{ datname?: string }> }>;
  end(): Promise<void>;
}

export type DatabaseAdminClientFactory = (connectionString: string) => DatabaseAdminClient;

export interface TestDatabaseTarget {
  connectionString: string;
  databaseName: string;
}

export function validateTestDatabaseUrl(databaseUrl: string | undefined): TestDatabaseTarget {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must point to an isolated PostgreSQL test database.');
  }

  let parsedUrl: URL;
  let databaseName: string;

  try {
    parsedUrl = new URL(databaseUrl);
    databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  } catch {
    throw new Error(
      'Database preparation refuses to run unless DATABASE_URL names a PostgreSQL database ending in _test.',
    );
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
    !parsedUrl.hostname ||
    parsedUrl.hash ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*_test$/.test(databaseName)
  ) {
    throw new Error(
      'Database preparation refuses to run unless DATABASE_URL names a PostgreSQL database ending in _test.',
    );
  }

  return { connectionString: parsedUrl.toString(), databaseName };
}

const defaultClientFactory: DatabaseAdminClientFactory = (connectionString) =>
  new Client({ connectionString }) as unknown as DatabaseAdminClient;

export async function ensureTestDatabaseExists(
  databaseUrl: string | undefined,
  clientFactory: DatabaseAdminClientFactory = defaultClientFactory,
): Promise<void> {
  const target = validateTestDatabaseUrl(databaseUrl);
  const adminUrl = new URL(target.connectionString);
  adminUrl.pathname = '/postgres';

  const client = clientFactory(adminUrl.toString());
  await client.connect();

  try {
    const result = await client.query('SELECT datname FROM pg_database WHERE datname = $1', [
      target.databaseName,
    ]);
    if (result.rows.length > 0) {
      return;
    }

    try {
      await client.query(`CREATE DATABASE "${target.databaseName}"`);
    } catch (error) {
      if (isDuplicateDatabaseError(error)) {
        return;
      }
      throw error;
    }
  } finally {
    await client.end();
  }
}

function isDuplicateDatabaseError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42P04';
}
