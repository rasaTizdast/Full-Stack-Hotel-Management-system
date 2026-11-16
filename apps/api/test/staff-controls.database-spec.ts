import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('staff controls PostgreSQL foundation', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      'SELECT current_database() AS database_name',
    );
    expect(result.rows[0].database_name).toMatch(/_test$/);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('supports named PMS roles, forced password changes, and append-only audit events', async () => {
    const roles = await pool.query<{ enumlabel: string }>(`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = 'staff_role'::regtype
      ORDER BY enumsortorder
    `);
    const passwordFlag = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'staff_users'
        AND column_name = 'must_change_password'
    `);
    const auditTable = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'audit_events'
    `);

    expect(roles.rows.map((role) => role.enumlabel)).toEqual([
      'ADMIN',
      'RECEPTIONIST',
      'MANAGER',
      'HOUSEKEEPER',
      'CASHIER',
    ]);
    expect(passwordFlag.rows).toEqual([{ column_name: 'must_change_password' }]);
    expect(auditTable.rows).toEqual([{ table_name: 'audit_events' }]);
  });

  it('rejects case-variant username and email duplicates at the database boundary', async () => {
    const ids = [randomUUID(), randomUUID()];
    const username = `hpm002-identity-${randomUUID()}`;
    const email = `${username}@example.invalid`;
    await pool.query(
      `INSERT INTO staff_users
         (id, username, email, password_hash, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'not-used-by-this-test', 'RECEPTIONIST', now(), now())`,
      [ids[0], username, email],
    );

    try {
      await expect(
        pool.query(
          `INSERT INTO staff_users
             (id, username, email, password_hash, role, created_at, updated_at)
           VALUES ($1, $2, $3, 'not-used-by-this-test', 'RECEPTIONIST', now(), now())`,
          [ids[1], username.toUpperCase(), email.toUpperCase()],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await pool.query('DELETE FROM staff_users WHERE id = ANY($1::uuid[])', [ids]);
    }
  });

  it('installs database guards that prevent audit event edits and truncation', async () => {
    const triggers = await pool.query<{ tgname: string }>(`
      SELECT tgname
      FROM pg_trigger
      WHERE tgrelid = to_regclass('audit_events')
        AND NOT tgisinternal
      ORDER BY tgname
    `);

    expect(triggers.rows.map((trigger) => trigger.tgname)).toEqual([
      'audit_events_no_truncate',
      'audit_events_no_update_or_delete',
    ]);
  });
});
