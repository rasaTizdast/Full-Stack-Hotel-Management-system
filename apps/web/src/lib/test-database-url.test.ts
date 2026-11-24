import { describe, expect, it } from 'vitest';
import { getIsolatedTestDatabaseUrl } from './test-database-url';

const testUrl = 'postgresql://tester:secret@127.0.0.1:5433/hotel_booking_hbe014_test?schema=public';

describe('isolated Playwright database target', () => {
  it('returns the validated test URL and accepts the same inherited target', () => {
    const env = `DATABASE_URL="${testUrl}"\n`;
    expect(getIsolatedTestDatabaseUrl(env, testUrl)).toBe(testUrl);
  });

  it('accepts a missing inherited URL while returning the validated .env target', () => {
    expect(getIsolatedTestDatabaseUrl(`DATABASE_URL=${testUrl}\n`, undefined)).toBe(testUrl);
  });

  it('rejects a non-test URL from the root .env file', () => {
    expect(() =>
      getIsolatedTestDatabaseUrl(
        'DATABASE_URL=postgresql://tester:secret@127.0.0.1:5433/hotel_booking_dev?schema=public',
        undefined,
      ),
    ).toThrow('root .env DATABASE_URL must target a database ending in _test');
  });

  it('rejects an inherited non-test URL even when .env is isolated', () => {
    expect(() =>
      getIsolatedTestDatabaseUrl(
        `DATABASE_URL=${testUrl}`,
        'postgresql://tester:secret@127.0.0.1:5433/hotel_booking_dev?schema=public',
      ),
    ).toThrow('inherited environment DATABASE_URL must target a database ending in _test');
  });

  it('rejects an inherited test URL that points at a different database', () => {
    expect(() =>
      getIsolatedTestDatabaseUrl(
        `DATABASE_URL=${testUrl}`,
        'postgresql://tester:secret@127.0.0.1:5433/another_test?schema=public',
      ),
    ).toThrow('must match the isolated database in the root .env file');
  });

  it('uses an explicit isolated override while keeping a development .env for credentials', () => {
    const override =
      'postgresql://tester:secret@127.0.0.1:55432/hotel_booking_hpm001_test?schema=public';
    expect(
      getIsolatedTestDatabaseUrl(
        'DATABASE_URL=postgresql://tester:secret@127.0.0.1:5433/hotel_booking_dev?schema=public',
        undefined,
        override,
      ),
    ).toBe(override);
  });

  it('validates the override as a PostgreSQL URL ending in _test', () => {
    expect(() =>
      getIsolatedTestDatabaseUrl(
        'DATABASE_URL=postgresql://tester:secret@127.0.0.1:5433/hotel_booking_dev',
        undefined,
        'postgresql://tester:secret@127.0.0.1:55432/hotel_booking_dev',
      ),
    ).toThrow('HBE_E2E_DATABASE_URL DATABASE_URL must target a database ending in _test');
    expect(() =>
      getIsolatedTestDatabaseUrl(
        'DATABASE_URL=postgresql://tester:secret@127.0.0.1:5433/hotel_booking_dev',
        undefined,
        'mysql://tester:secret@127.0.0.1:55432/hotel_booking_hpm001_test',
      ),
    ).toThrow('HBE_E2E_DATABASE_URL must contain a valid PostgreSQL DATABASE_URL');
  });

  it('rejects an inherited DATABASE_URL that disagrees with the override', () => {
    const override = 'postgresql://tester:secret@127.0.0.1:55432/hotel_booking_hpm001_test';
    expect(() =>
      getIsolatedTestDatabaseUrl(
        'DATABASE_URL=postgresql://tester:secret@127.0.0.1:5433/hotel_booking_dev',
        'postgresql://tester:secret@127.0.0.1:55432/another_test',
        override,
      ),
    ).toThrow('must match HBE_E2E_DATABASE_URL');
    expect(() =>
      getIsolatedTestDatabaseUrl(
        'DATABASE_URL=postgresql://tester:secret@127.0.0.1:5433/hotel_booking_dev',
        'postgresql://tester:secret@127.0.0.1:5433/hotel_booking_dev',
        override,
      ),
    ).toThrow('inherited environment DATABASE_URL must target a database ending in _test');
  });
});
