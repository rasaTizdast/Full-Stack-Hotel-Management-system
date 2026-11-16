import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { StaffAuthService } from './staff-auth.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

describe('StaffAuthService', () => {
  const password = 'test-only-staff-password-long';
  let user: {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    role: 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER';
    isActive: boolean;
    mustChangePassword: boolean;
  };
  let prisma: {
    staffUser: { findUnique: jest.Mock; updateMany: jest.Mock };
    staffSession: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: StaffAuthService;

  beforeEach(async () => {
    user = {
      id: randomUUID(),
      username: 'admin@example.invalid',
      email: 'admin@example.invalid',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      role: 'ADMIN',
      isActive: true,
      mustChangePassword: false,
    };
    prisma = {
      staffUser: {
        findUnique: jest.fn(({ where }: { where: { email?: string; id?: string } }) =>
          Promise.resolve(where.email === user.email || where.id === user.id ? user : null),
        ),
        updateMany: jest.fn(({ data }: { data: Partial<typeof user> }) => {
          user = { ...user, ...data };
          return Promise.resolve({ count: 1 });
        }),
      },
      staffSession: {
        create: jest.fn().mockResolvedValue({ id: randomUUID() }),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(prisma),
      ),
    };
    service = new StaffAuthService(prisma as unknown as PrismaService);
  });

  it('verifies Argon2id passwords and persists only hashed session credentials', async () => {
    const result = await service.login(user.email, password);
    const createCalls = prisma.staffSession.create.mock.calls as unknown as Array<
      [{ data: { tokenHash: string; csrfTokenHash: string; expiresAt: Date } }]
    >;
    const sessionData = createCalls[0][0].data;
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');

    expect(result.staff).toEqual({
      username: user.username,
      email: user.email,
      role: 'ADMIN',
      mustChangePassword: false,
    });
    expect(result.staff).not.toHaveProperty('id');
    expect(result.staff).not.toHaveProperty('passwordHash');
    expect(sessionData.tokenHash).toBe(hash(result.sessionToken));
    expect(sessionData.csrfTokenHash).toBe(hash(result.csrfToken));
    expect(sessionData.tokenHash).not.toBe(result.sessionToken);
    expect(sessionData.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects inactive staff even when the password is correct', async () => {
    user.isActive = false;

    await expect(service.login(user.email, password)).rejects.toThrow(UnauthorizedException);
    expect(prisma.staffSession.create).not.toHaveBeenCalled();
  });

  it('rejects incorrect passwords without creating a session', async () => {
    await expect(service.login(user.email, 'wrong-test-password-value')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.staffSession.create).not.toHaveBeenCalled();
  });

  it('rotates the stored CSRF hash on current-user refresh', async () => {
    const csrfToken = await service.rotateCsrfToken('session-id');
    const updateCalls = prisma.staffSession.update.mock.calls as unknown as Array<
      [{ where: { id: string }; data: { csrfTokenHash: string } }]
    >;
    const update = updateCalls[0][0];

    expect(update.where.id).toBe('session-id');
    expect(update.data.csrfTokenHash).toBe(createHash('sha256').update(csrfToken).digest('hex'));
    expect(update.data.csrfTokenHash).not.toBe(csrfToken);
  });

  it('revokes a session on logout', async () => {
    await service.logout('session-id');

    const updateCalls = prisma.staffSession.updateMany.mock.calls as unknown as Array<
      [{ where: { id: string; revokedAt: null }; data: { revokedAt: Date } }]
    >;
    expect(updateCalls[0][0].where).toEqual({ id: 'session-id', revokedAt: null });
    expect(updateCalls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });
});
