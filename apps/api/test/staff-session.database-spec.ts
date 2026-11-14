import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('PostgreSQL staff sessions', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let staffUserId: string;

  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      'SELECT current_database() AS database_name',
    );
    expect(result.rows[0].database_name).toMatch(/_test$/);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    staffUserId = randomUUID();
    const suffix = randomUUID();
    await pool.query(
      `INSERT INTO staff_users
        (id, username, email, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ADMIN', true, now(), now())`,
      [
        staffUserId,
        `session-test-${suffix}`,
        `session-${suffix}@example.invalid`,
        '$argon2id$fixture',
      ],
    );
  });

  afterEach(async () => {
    const table = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.staff_sessions') IS NOT NULL AS exists",
    );
    if (table.rows[0].exists) {
      await pool.query('DELETE FROM staff_sessions WHERE staff_user_id = $1', [staffUserId]);
    }
    await pool.query('DELETE FROM staff_users WHERE id = $1', [staffUserId]);
  });

  it('stores only hashed opaque credentials and invalidates sessions immediately', async () => {
    const rawSessionToken = randomBytes(32).toString('base64url');
    const rawCsrfToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawSessionToken).digest('hex');
    const csrfTokenHash = createHash('sha256').update(rawCsrfToken).digest('hex');
    const sessionId = randomUUID();

    await pool.query(
      `INSERT INTO staff_sessions
        (id, staff_user_id, token_hash, csrf_token_hash, expires_at, revoked_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now() + interval '12 hours', NULL, now(), now())`,
      [sessionId, staffUserId, tokenHash, csrfTokenHash],
    );

    const stored = await pool.query<{ token_hash: string; csrf_token_hash: string }>(
      'SELECT token_hash, csrf_token_hash FROM staff_sessions WHERE id = $1',
      [sessionId],
    );
    expect(stored.rows).toEqual([{ token_hash: tokenHash, csrf_token_hash: csrfTokenHash }]);
    expect(stored.rows[0].token_hash).not.toBe(rawSessionToken);
    expect(stored.rows[0].csrf_token_hash).not.toBe(rawCsrfToken);

    await pool.query('UPDATE staff_sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
    const active = await pool.query<{ count: string }>(
      'SELECT count(*) FROM staff_sessions WHERE id = $1 AND revoked_at IS NULL',
      [sessionId],
    );
    expect(active.rows[0].count).toBe('0');
  });
});
