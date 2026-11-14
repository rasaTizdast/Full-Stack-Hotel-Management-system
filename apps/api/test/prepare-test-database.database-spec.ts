import {
  ensureTestDatabaseExists,
  validateTestDatabaseUrl,
  type DatabaseAdminClient,
} from './prepare-test-database.js';

const testDatabaseUrl =
  'postgresql://test-user:test-password@127.0.0.1:5433/hotel_booking_hbe019_test';

function createAdminClient(existingDatabase = false) {
  const end = jest.fn().mockResolvedValue(undefined);
  const query = jest
    .fn()
    .mockResolvedValueOnce({
      rows: existingDatabase ? [{ datname: 'hotel_booking_hbe019_test' }] : [],
    })
    .mockResolvedValueOnce({ rows: [] });
  const client: DatabaseAdminClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    query,
    end,
  };

  return { client, end, query };
}

describe('test database preparation', () => {
  it('requires an explicit DATABASE_URL', () => {
    expect(() => validateTestDatabaseUrl(undefined)).toThrow(
      'DATABASE_URL must point to an isolated PostgreSQL test database.',
    );
  });

  it.each([
    'postgresql://test-user:test-password@127.0.0.1:5433/hotel_booking',
    'postgresql://test-user:test-password@127.0.0.1:5433/hotel_booking_hbe019_test_backup',
    'mysql://test-user:test-password@127.0.0.1:5433/hotel_booking_hbe019_test',
  ])('rejects unsafe database URLs (%s)', (databaseUrl) => {
    expect(() => validateTestDatabaseUrl(databaseUrl)).toThrow(
      'Database preparation refuses to run unless DATABASE_URL names a PostgreSQL database ending in _test.',
    );
  });

  it('creates the validated database only when it is absent', async () => {
    const { client, end, query } = createAdminClient();
    const clientFactory = jest.fn().mockReturnValue(client);

    await ensureTestDatabaseExists(testDatabaseUrl, clientFactory);

    expect(clientFactory).toHaveBeenCalledWith(
      'postgresql://test-user:test-password@127.0.0.1:5433/postgres',
    );
    expect(query).toHaveBeenNthCalledWith(1, 'SELECT datname FROM pg_database WHERE datname = $1', [
      'hotel_booking_hbe019_test',
    ]);
    expect(query).toHaveBeenNthCalledWith(2, 'CREATE DATABASE "hotel_booking_hbe019_test"');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('leaves an existing test database untouched', async () => {
    const { client, end, query } = createAdminClient(true);

    await ensureTestDatabaseExists(testDatabaseUrl, () => client);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT datname FROM pg_database WHERE datname = $1', [
      'hotel_booking_hbe019_test',
    ]);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
