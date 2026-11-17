import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  assertTestDatabaseUrl,
  cleanupWalkInFixture,
  WalkInFixtureCleanupError,
} from './walk-in-fixture-cleanup';

async function main(): Promise<void> {
  const [reference, guestPhone, ...extraArgs] = process.argv.slice(2);
  if (!reference || !guestPhone || extraArgs.length > 0) {
    throw new WalkInFixtureCleanupError('INVALID_REFERENCE');
  }
  const connectionString = assertTestDatabaseUrl(process.env.DATABASE_URL);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 1, connectionTimeoutMillis: 5_000 }),
  });
  try {
    const result = await cleanupWalkInFixture(prisma, { reference, guestPhone });
    process.stdout.write(`Walk-in fixture cleanup: ${result}.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code = error instanceof WalkInFixtureCleanupError ? error.code : 'CLEANUP_FAILED';
  process.stderr.write(`Walk-in fixture cleanup refused (${code}).\n`);
  process.exitCode = 1;
});
