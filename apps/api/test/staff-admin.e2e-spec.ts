import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';
import { StaffAdminService } from '../src/staff-admin/staff-admin.service';

type StaffSession = { cookie: string; csrfToken: string };
type AccountList = {
  items: Array<{
    id: string;
    username: string;
    email: string;
    role: string;
    isActive: boolean;
    mustChangePassword: boolean;
    createdAt: string;
  }>;
  page: number;
  pageSize: number;
  total: number;
};

function bodyOf<T>(response: { body: unknown }): T {
  if (typeof response.body !== 'object' || response.body === null) {
    throw new Error('The API response body was not an object.');
  }
  return response.body as T;
}

describe('Staff account administration API (e2e)', () => {
  const suffix = randomUUID();
  const adminId = randomUUID();
  const receptionistId = randomUUID();
  const adminEmail = `hpm002-admin-${suffix}@example.invalid`;
  const adminPassword = 'Hpm002-admin-test-password-2026!';
  const receptionistEmail = `hpm002-reception-${suffix}@example.invalid`;
  const receptionistPassword = 'Hpm002-reception-test-password-2026!';
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let staffAdmin: StaffAdminService;
  let admin: StaffSession;
  let receptionist: StaffSession;
  const createdAccountIds: string[] = [];

  async function signIn(email: string, password: string): Promise<StaffSession> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return {
      cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
      csrfToken: bodyOf<{ csrfToken: string }>(response).csrfToken,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    staffAdmin = app.get(StaffAdminService);

    await prisma.staffUser.createMany({
      data: [
        {
          id: adminId,
          username: `hpm002-admin-${suffix}`,
          email: adminEmail,
          passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
          role: 'ADMIN',
        },
        {
          id: receptionistId,
          username: `hpm002-reception-${suffix}`,
          email: receptionistEmail,
          passwordHash: await argon2.hash(receptionistPassword, { type: argon2.argon2id }),
          role: 'RECEPTIONIST',
        },
      ],
    });
    admin = await signIn(adminEmail, adminPassword);
    receptionist = await signIn(receptionistEmail, receptionistPassword);
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const accountIds = [adminId, receptionistId, ...createdAccountIds];
      await prisma.staffSession.deleteMany({ where: { staffUserId: { in: accountIds } } });
      await prisma.staffUser.updateMany({
        where: { id: { in: accountIds } },
        data: { isActive: false },
      });
    }
    await app?.close();
  });

  it('returns the bounded account page envelope and a secret-free account allowlist', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/staff/admin/accounts')
      .set('Cookie', admin.cookie)
      .expect(200);
    const result = bodyOf<AccountList>(response);

    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(result).toMatchObject({ page: 1, pageSize: 25 });
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.items.some((account) => account.email === adminEmail)).toBe(true);
    expect(result.items[0]).toHaveProperty('createdAt');
    expect(result.items[0]).not.toHaveProperty('passwordHash');
    expect(result.items[0]).not.toHaveProperty('sessions');
    expect(result.items[0]).not.toHaveProperty('tokenHash');
    expect(result.items[0]).not.toHaveProperty('csrfTokenHash');
  });

  it('denies a receptionist access to staff account administration', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/staff/admin/accounts')
      .set('Cookie', receptionist.cookie)
      .expect(403);

    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects invalid account paging and never exposes staff data on validation errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/staff/admin/accounts')
      .set('Cookie', admin.cookie)
      .query({ page: 0, pageSize: 101 })
      .expect(400);

    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(response.body).not.toHaveProperty('items');
  });

  it('creates normalized accounts, forces first password change, and audits without secrets', async () => {
    const email = `HPM002-New-${suffix}@Example.Invalid`;
    const initialPassword = 'Hpm002-initial-password-2026!';
    const created = await request(app.getHttpServer())
      .post('/api/v1/staff/admin/accounts')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        username: `Night.Manager-${suffix}`,
        email,
        initialPassword,
        role: 'MANAGER',
      })
      .expect('Cache-Control', 'private, no-store')
      .expect(201);
    const account = bodyOf<AccountList['items'][number]>(created);
    createdAccountIds.push(account.id);
    expect(account).toMatchObject({
      username: `night.manager-${suffix}`,
      email: email.toLowerCase(),
      role: 'MANAGER',
      isActive: true,
      mustChangePassword: true,
    });
    expect(created.body).not.toHaveProperty('passwordHash');
    expect(created.body).not.toHaveProperty('initialPassword');
    expect(created.body).not.toHaveProperty('sessions');

    const audit = await prisma.auditEvent.findFirst({
      where: { eventName: 'STAFF_ACCOUNT_CREATED', targetId: account.id },
    });
    expect(audit).toMatchObject({
      actorStaffUserId: adminId,
      after: { role: 'MANAGER', isActive: true, mustChangePassword: true },
    });
    expect(JSON.stringify(audit)).not.toContain(initialPassword);
    expect(JSON.stringify(audit)).not.toContain(email);

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/staff/admin/accounts')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        username: `NIGHT.MANAGER-${suffix}`,
        email: email.toUpperCase(),
        initialPassword: 'Hpm002-another-password-2026!',
        role: 'MANAGER',
      })
      .expect(409);
    expect(duplicate.body).toMatchObject({ code: 'STAFF_ACCOUNT_EXISTS' });

    const managerSession = await signIn(account.email, initialPassword);
    const managerProfile = await request(app.getHttpServer())
      .get('/api/v1/staff/auth/me')
      .set('Cookie', managerSession.cookie)
      .expect(200);
    const managerProfileBody = bodyOf<{
      staff: { role: string; mustChangePassword: boolean };
      csrfToken: string;
    }>(managerProfile);
    expect(managerProfileBody.staff).toMatchObject({ role: 'MANAGER', mustChangePassword: true });
    const rotatedCsrfCookie = (managerProfile.headers['set-cookie'] as unknown as string[]).find(
      (cookie) => cookie.startsWith('hotel_staff_csrf='),
    )!;
    const sessionCookie = managerSession.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('hotel_staff_session='))!;
    const refreshedManagerCookie = `${sessionCookie}; ${rotatedCsrfCookie.split(';')[0]}`;
    const refreshedManagerCsrf = managerProfileBody.csrfToken;

    const operational = await request(app.getHttpServer())
      .get('/api/v1/staff/bookings')
      .set('Cookie', refreshedManagerCookie)
      .expect(403);
    expect(bodyOf<{ code: string }>(operational).code).toBe('PASSWORD_CHANGE_REQUIRED');

    await request(app.getHttpServer())
      .post('/api/v1/staff/auth/change-password')
      .set('Cookie', refreshedManagerCookie)
      .set('X-CSRF-Token', refreshedManagerCsrf)
      .send({ currentPassword: initialPassword, newPassword: 'Hpm002-updated-password-2026!' })
      .expect(204);
    const refreshed = await request(app.getHttpServer())
      .get('/api/v1/staff/auth/me')
      .set('Cookie', refreshedManagerCookie)
      .expect(200);
    expect(bodyOf<{ staff: { mustChangePassword: boolean } }>(refreshed).staff).toMatchObject({
      mustChangePassword: false,
    });
  });

  it('requires and records reasons for role changes and deactivation, revoking old sessions', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/staff/admin/accounts')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        username: `cashier-${suffix}`,
        email: `cashier-${suffix}@example.invalid`,
        initialPassword: 'Hpm002-cashier-initial-2026!',
        role: 'RECEPTIONIST',
      })
      .expect(201);
    const account = bodyOf<AccountList['items'][number]>(created);
    createdAccountIds.push(account.id);

    const missingReason = await request(app.getHttpServer())
      .patch(`/api/v1/staff/admin/accounts/${account.id}/role`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ role: 'CASHIER', reason: '   ' })
      .expect(400);
    expect(bodyOf<{ code: string }>(missingReason).code).toBe('VALIDATION_ERROR');

    const changed = await request(app.getHttpServer())
      .patch(`/api/v1/staff/admin/accounts/${account.id}/role`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ role: 'CASHIER', reason: 'Assigned to payment desk.' })
      .expect(200);
    expect(bodyOf<AccountList['items'][number]>(changed)).toMatchObject({
      id: account.id,
      role: 'CASHIER',
    });
    const roleAudit = await prisma.auditEvent.findFirst({
      where: { eventName: 'STAFF_ROLE_CHANGED', targetId: account.id },
    });
    expect(roleAudit).toMatchObject({
      actorStaffUserId: adminId,
      reason: 'Assigned to payment desk.',
      before: { role: 'RECEPTIONIST' },
      after: { role: 'CASHIER' },
    });

    const target = await request(app.getHttpServer())
      .post('/api/v1/staff/admin/accounts')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        username: `deactivate-${suffix}`,
        email: `deactivate-${suffix}@example.invalid`,
        initialPassword: 'Hpm002-deactivate-initial-2026!',
        role: 'RECEPTIONIST',
      })
      .expect(201);
    const targetAccount = bodyOf<AccountList['items'][number]>(target);
    createdAccountIds.push(targetAccount.id);
    const oldSession = await signIn(targetAccount.email, 'Hpm002-deactivate-initial-2026!');

    const deactivated = await request(app.getHttpServer())
      .post(`/api/v1/staff/admin/accounts/${targetAccount.id}/deactivate`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ reason: 'Seasonal assignment ended.' })
      .expect(200);
    expect(bodyOf<AccountList['items'][number]>(deactivated).isActive).toBe(false);
    const revoked = await request(app.getHttpServer())
      .get('/api/v1/staff/auth/me')
      .set('Cookie', oldSession.cookie)
      .expect(401);
    expect(revoked.headers['cache-control']).toBe('private, no-store');
    const deactivationAudit = await prisma.auditEvent.findFirst({
      where: { eventName: 'STAFF_ACCOUNT_DEACTIVATED', targetId: targetAccount.id },
    });
    expect(deactivationAudit).toMatchObject({
      actorStaffUserId: adminId,
      reason: 'Seasonal assignment ended.',
      before: { isActive: true },
      after: { isActive: false },
    });
  });

  it('rolls back a staff account mutation when its audit event cannot be appended', async () => {
    const username = `hpm002-audit-rollback-${suffix}`;
    const email = `${username}@example.invalid`;
    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION "hpm002_reject_account_audit"() RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        IF NEW."event_name" = 'STAFF_ACCOUNT_CREATED' THEN
          RAISE EXCEPTION 'injected test audit failure';
        END IF;
        RETURN NEW;
      END;
      $function$
    `;

    try {
      await prisma.$executeRaw`
        CREATE TRIGGER "hpm002_reject_account_audit_insert"
        BEFORE INSERT ON "audit_events"
        FOR EACH ROW EXECUTE FUNCTION "hpm002_reject_account_audit"()
      `;
      const response = await request(app.getHttpServer())
        .post('/api/v1/staff/admin/accounts')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrfToken)
        .send({
          username,
          email,
          initialPassword: 'Hpm002-audit-rollback-password-2026!',
          role: 'MANAGER',
        })
        .expect('Cache-Control', 'private, no-store')
        .expect(500);

      expect(response.body).not.toHaveProperty('passwordHash');
      expect(await prisma.staffUser.findUnique({ where: { email } })).toBeNull();
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS "hpm002_reject_account_audit_insert" ON "audit_events"`;
      await prisma.$executeRaw`DROP FUNCTION IF EXISTS "hpm002_reject_account_audit"()`;
    }
  });

  it('prevents concurrent self-demotions from removing the final active administrator', async () => {
    await prisma.staffUser.updateMany({ where: { role: 'ADMIN' }, data: { isActive: false } });
    const adminBId = randomUUID();
    const adminBEmail = `hpm002-final-admin-${suffix}@example.invalid`;
    await prisma.staffUser.create({
      data: {
        id: adminBId,
        username: `hpm002-final-admin-${suffix}`,
        email: adminBEmail,
        passwordHash: await argon2.hash('Hpm002-second-admin-password-2026!', {
          type: argon2.argon2id,
        }),
        role: 'ADMIN',
      },
    });
    createdAccountIds.push(adminBId);
    await prisma.staffUser.update({ where: { id: adminId }, data: { isActive: true } });

    const outcomes = await Promise.allSettled([
      staffAdmin.changeRole(adminId, adminId, {
        role: 'MANAGER',
        reason: 'Concurrent final-admin invariant test A.',
      }),
      staffAdmin.changeRole(adminBId, adminBId, {
        role: 'MANAGER',
        reason: 'Concurrent final-admin invariant test B.',
      }),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.staffUser.count({ where: { role: 'ADMIN', isActive: true } })).toBe(1);
  });
});
