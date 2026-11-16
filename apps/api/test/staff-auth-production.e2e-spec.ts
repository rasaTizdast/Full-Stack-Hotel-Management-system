import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { configureApiApplication } from '../src/common/configure-api-application';

type StaffResponse = {
  staff?: { username: string; email: string; role: 'ADMIN'; mustChangePassword: boolean };
};

const previousNodeEnv = process.env.NODE_ENV;
const previousWebOrigin = process.env.WEB_ORIGIN;
process.env.NODE_ENV = 'production';
process.env.WEB_ORIGIN = 'https://hotel.example';

describe('Staff authentication cookies in production (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const { AppModule } = jest.requireActual<{ AppModule: Type<unknown> }>('../src/app.module');
    const { PrismaService } = jest.requireActual<{ PrismaService: Type<unknown> }>(
      '../src/database/prisma.service',
    );
    const email = `production-${randomUUID()}@example.invalid`;
    const password = 'production-test-password-long';
    const user = {
      id: randomUUID(),
      username: email,
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      role: 'ADMIN',
      isActive: true,
      mustChangePassword: false,
    };
    const prisma = {
      staffUser: { findUnique: jest.fn().mockResolvedValue(user) },
      staffSession: { create: jest.fn().mockResolvedValue({ id: randomUUID() }) },
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(app);
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/v1/staff/auth/login')
      .set('Origin', 'https://hotel.example')
      .send({ email, password })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(2);
    expect(cookies.every((cookie) => /; Secure(?:;|$)/i.test(cookie))).toBe(true);
    expect(cookies.every((cookie) => /; HttpOnly(?:;|$)/i.test(cookie))).toBe(true);
    expect(cookies.every((cookie) => /; SameSite=Lax(?:;|$)/i.test(cookie))).toBe(true);
    expect((response.body as StaffResponse).staff).toEqual({
      username: email,
      email,
      role: 'ADMIN',
      mustChangePassword: false,
    });
  });

  afterAll(async () => {
    await app.close();
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousWebOrigin === undefined) {
      delete process.env.WEB_ORIGIN;
    } else {
      process.env.WEB_ORIGIN = previousWebOrigin;
    }
  });

  it('uses production-only secure cookie flags', () => {
    expect(process.env.NODE_ENV).toBe('production');
  });
});
