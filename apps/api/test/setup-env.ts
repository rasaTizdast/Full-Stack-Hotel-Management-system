import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://hotel_test:hotel_test@127.0.0.1:5433/hotel_booking_test?schema=public';

const databaseName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (!databaseName.endsWith('_test')) {
  throw new Error(
    'API e2e tests refuse to run unless DATABASE_URL points to an isolated _test database.',
  );
}
