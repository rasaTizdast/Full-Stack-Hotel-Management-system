import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';
import { RequireStaffRoles } from '../src/staff-auth/require-staff-roles.decorator';

type StaffAuthResponseBody = {
  code?: string;
  csrfToken?: string;
  staff?: { username: string; email: string; role: 'ADMIN' | 'RECEPTIONIST' };
};

function bodyOf(response: { body: unknown }): StaffAuthResponseBody {
  return response.body as StaffAuthResponseBody;
}

@Controller('staff/authorization-fixture')
class AuthorizationFixtureController {
  @Get('admin')
  @RequireStaffRoles('ADMIN')
  adminOnly(): { allowed: true } {
    return { allowed: true };
  }

  @Get('receptionist')
  @RequireStaffRoles('RECEPTIONIST')
  receptionistOnly(): { allowed: true } {
    return { allowed: true };
  }
}

describe('Staff authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: {
    staffUser: { findUnique: jest.Mock };
    staffSession: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let user: {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    role: 'ADMIN' | 'RECEPTIONIST';
    isActive: true;
  };
  let sessions: Array<{
    id: string;
    staffUserId: string;
    tokenHash: string;
    csrfTokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
  }>;
  let email: string;
  const password = 'correct-test-password-very-long';

  async function createApp(): Promise<INestApplication<App>> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuthorizationFixtureController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    const testApp = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(testApp);
    await testApp.init();
    return testApp;
  }

  beforeEach(async () => {
    email = `auth-${randomUUID()}@example.invalid`;
    user = {
      id: randomUUID(),
      username: email,
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      role: 'ADMIN',
      isActive: true,
    };
    sessions = [];
    prisma = {
      staffUser: {
        findUnique: jest.fn(({ where }: { where: { email: string } }) =>
          Promise.resolve(where.email === email ? user : null),
        ),
      },
      staffSession: {
        create: jest.fn(
          ({ data }: { data: Omit<(typeof sessions)[number], 'id' | 'revokedAt'> }) => {
            const session = { ...data, id: randomUUID(), revokedAt: null };
            sessions.push(session);
            return Promise.resolve(session);
          },
        ),
        findFirst: jest.fn(({ where }: { where: { tokenHash: string } }) =>
          Promise.resolve(
            (() => {
              const now = Date.now();
              const session = sessions.find(
                (candidate) =>
                  candidate.tokenHash === where.tokenHash &&
                  candidate.revokedAt === null &&
                  candidate.expiresAt.getTime() > now,
              );
              return session ? { ...session, staffUser: user } : null;
            })(),
          ),
        ),
        update: jest.fn(
          ({ where, data }: { where: { id: string }; data: { csrfTokenHash: string } }) => {
            const session = sessions.find((candidate) => candidate.id === where.id);
            if (!session) {
              throw new Error('Session not found.');
            }
            session.csrfTokenHash = data.csrfTokenHash;
            return Promise.resolve({ ...session, staffUser: user });
          },
        ),
        updateMany: jest.fn(
          ({ where, data }: { where: { id: string }; data: { revokedAt: Date } }) => {
            const session = sessions.find((candidate) => candidate.id === where.id);
            if (!session) {
              return Promise.resolve({ count: 0 });
            }
            session.revokedAt = data.revokedAt;
            return Promise.resolve({ count: 1 });
          },
        ),
      },
    };

    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects unauthenticated access to the current-staff endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/staff/auth/me').expect(401);

    expect(bodyOf(response).code).toBe('UNAUTHORIZED');
    expect(response.body).not.toHaveProperty('staff');
  });

  it('allows credentialed browser API requests only from the configured web origin', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']).toContain('x-csrf-token');

    const untrustedOrigin = await request(app.getHttpServer())
      .options('/api/v1/staff/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(untrustedOrigin.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('issues an opaque cookie and persists only hashes for a valid login', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password })
      .expect(200);

    expect(bodyOf(response)).toMatchObject({
      staff: { username: email, email, role: 'ADMIN' },
    });
    expect(bodyOf(response)).not.toHaveProperty('staff.id');
    expect(bodyOf(response)).not.toHaveProperty('sessionToken');
    expect(bodyOf(response)).not.toHaveProperty('passwordHash');
    expect(bodyOf(response)).toHaveProperty('csrfToken');

    const setCookies = response.headers['set-cookie'] as unknown as string[];
    const sessionCookie = setCookies.find((cookie) => cookie.startsWith('hotel_staff_session='));
    const csrfCookie = setCookies.find((cookie) => cookie.startsWith('hotel_staff_csrf='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).toMatch(/Path=\/api\/v1\/staff/i);
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).toMatch(/HttpOnly/i);

    const rawSessionToken = sessionCookie!.split(';')[0].split('=')[1];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toMatch(/^[a-f0-9]{64}$/i);
    expect(sessions[0].tokenHash).not.toBe(rawSessionToken);
    expect(sessions[0].csrfTokenHash).toMatch(/^[a-f0-9]{64}$/i);
    expect(sessions[0].csrfTokenHash).not.toBe(bodyOf(response).csrfToken);

    const currentUser = await request(app.getHttpServer())
      .get('/api/v1/staff/auth/me')
      .set('Cookie', `${sessionCookie!.split(';')[0]}; ${csrfCookie!.split(';')[0]}`)
      .expect(200);
    expect(bodyOf(currentUser).staff).toEqual({ username: email, email, role: 'ADMIN' });
    expect(currentUser.body).not.toHaveProperty('id');
    expect(currentUser.body).not.toHaveProperty('passwordHash');
    expect(bodyOf(currentUser).csrfToken).toBeDefined();
    expect(bodyOf(currentUser).csrfToken).not.toBe(bodyOf(response).csrfToken);
    expect(currentUser.headers['set-cookie']).toContainEqual(
      expect.stringMatching(/^hotel_staff_csrf=/),
    );
  });

  it('rejects invalid credentials without echoing the submitted password', async () => {
    const submittedPassword = 'wrong-private-password-value';
    const response = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: submittedPassword })
      .expect(401);

    expect(bodyOf(response).code).toBe('UNAUTHORIZED');
    expect(response.text).not.toContain(submittedPassword);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('validates login fields before querying staff credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);

    expect(bodyOf(response).code).toBe('VALIDATION_ERROR');
    expect(response.text).toContain('email');
    expect(response.text).toContain('password');
    expect(response.text).not.toContain('not-an-email');
    expect(response.text).not.toContain('short');
    expect(prisma.staffUser.findUnique).not.toHaveBeenCalled();
  });

  it('requires CSRF proof for logout and invalidates the persisted session', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password })
      .expect(200);
    const setCookies = login.headers['set-cookie'] as unknown as string[];
    const sessionCookie = setCookies.find((cookie) => cookie.startsWith('hotel_staff_session='))!;
    const csrfCookie = setCookies.find((cookie) => cookie.startsWith('hotel_staff_csrf='))!;
    const cookieHeader = `${sessionCookie.split(';')[0]}; ${csrfCookie.split(';')[0]}`;

    const currentUser = await request(app.getHttpServer())
      .get('/api/v1/staff/auth/me')
      .set('Cookie', cookieHeader)
      .expect(200);
    const rotatedCsrfCookie = (currentUser.headers['set-cookie'] as unknown as string[]).find(
      (cookie) => cookie.startsWith('hotel_staff_csrf='),
    )!;

    await request(app.getHttpServer())
      .post('/api/v1/staff/auth/logout')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', bodyOf(login).csrfToken!)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/staff/auth/logout')
      .set('Cookie', `${sessionCookie.split(';')[0]}; ${rotatedCsrfCookie.split(';')[0]}`)
      .set('X-CSRF-Token', bodyOf(currentUser).csrfToken!)
      .expect(204);

    expect(sessions[0].revokedAt).toBeInstanceOf(Date);

    await request(app.getHttpServer())
      .get('/api/v1/staff/auth/me')
      .set('Cookie', cookieHeader)
      .expect(401);
  });

  it('limits repeated login attempts and returns a stable rate-limit error', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/staff/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email, password: 'incorrect-password-value' })
        .expect(401);
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: 'incorrect-password-value' })
      .expect(429);

    expect(bodyOf(response).code).toBe('TOO_MANY_REQUESTS');
    expect(response.text).not.toContain('incorrect-password-value');
  });

  it('enforces receptionist and admin roles on protected staff endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/staff/authorization-fixture/admin').expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password })
      .expect(200);
    const sessionCookie = (login.headers['set-cookie'] as unknown as string[]).find((cookie) =>
      cookie.startsWith('hotel_staff_session='),
    )!;
    const cookieHeader = sessionCookie.split(';')[0];

    await request(app.getHttpServer())
      .get('/api/v1/staff/authorization-fixture/admin')
      .set('Cookie', cookieHeader)
      .expect(200)
      .expect({ allowed: true });

    user.role = 'RECEPTIONIST';
    await request(app.getHttpServer())
      .get('/api/v1/staff/authorization-fixture/admin')
      .set('Cookie', cookieHeader)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/staff/authorization-fixture/receptionist')
      .set('Cookie', cookieHeader)
      .expect(200)
      .expect({ allowed: true });
  });

  it('rejects login CSRF attempts from an untrusted origin', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email, password })
      .expect(403);

    expect(bodyOf(response).code).toBe('FORBIDDEN');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.text).not.toContain(password);
  });

  it('rejects browser login requests that omit both Origin and Referer', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .send({ email, password })
      .expect(403);

    expect(bodyOf(response).code).toBe('FORBIDDEN');
    expect(prisma.staffUser.findUnique).not.toHaveBeenCalled();
  });

  it('accepts same-origin Referer when the Origin header is unavailable', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Referer', 'http://localhost:3000/staff/login')
      .send({ email, password })
      .expect(200);
  });
});
