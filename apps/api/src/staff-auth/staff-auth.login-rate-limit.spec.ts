import { ExecutionContext, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import { StaffAuthController } from './staff-auth.controller';
import type { StaffAuthService } from './staff-auth.service';
import type { StaffRequest } from './staff-auth.types';

type ControllerConstructor = new (...args: unknown[]) => StaffAuthController;

function createHarness() {
  const rateLimit = new LoginRateLimitService();
  const guard = new LoginRateLimitGuard(rateLimit);
  const auth = {
    login: jest.fn((email: string, password: string) => {
      if (password !== 'correct-password') {
        throw new UnauthorizedException('Email or password is incorrect.');
      }
      return {
        staff: {
          username: email.split('@')[0],
          email,
          role: 'RECEPTIONIST' as const,
          mustChangePassword: false,
        },
        sessionToken: `session-${email}`,
        csrfToken: `csrf-${email}`,
      };
    }),
  } as unknown as StaffAuthService;
  const config = { get: () => 'test' } as unknown as ConfigService;
  const controller = new (StaffAuthController as unknown as ControllerConstructor)(
    auth,
    config,
    rateLimit,
  );
  const controllerWithRateLimit = controller as unknown as {
    login(
      dto: { email: string; password: string },
      request: StaffRequest,
      response: { append: jest.Mock },
    ): Promise<unknown>;
  };

  async function login(clientIp: string, email: string, password: string): Promise<unknown> {
    const staffRequest = {
      ip: clientIp,
      socket: { remoteAddress: clientIp },
      body: { email },
    } as unknown as StaffRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => staffRequest }),
    } as unknown as ExecutionContext;
    const response = { append: jest.fn() };

    guard.canActivate(context);
    return controllerWithRateLimit.login({ email, password }, staffRequest, response);
  }

  return { auth, login };
}

async function expectRateLimited(loginAttempt: Promise<unknown>): Promise<void> {
  let error: unknown;
  try {
    await loginAttempt;
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(429);
}

describe('staff login rate limit integration', () => {
  it('allows six successful identities signing in from one shared IP', async () => {
    const { login } = createHarness();

    for (let index = 0; index < 6; index += 1) {
      await expect(
        login('192.0.2.20', `staff-${index}@example.invalid`, 'correct-password'),
      ).resolves.toMatchObject({ staff: { role: 'RECEPTIONIST' } });
    }
  });

  it('limits only the sixth failed credential for the same identity', async () => {
    const { login } = createHarness();
    const email = 'desk@example.invalid';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(login('192.0.2.21', email, 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    }
    await expectRateLimited(login('192.0.2.21', email, 'wrong-password'));

    await expect(
      login('192.0.2.21', 'another-desk@example.invalid', 'correct-password'),
    ).resolves.toMatchObject({ staff: { role: 'RECEPTIONIST' } });
  });

  it('resets the identity failure bucket after valid credentials', async () => {
    const { login } = createHarness();
    const email = 'reset@example.invalid';

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(login('192.0.2.22', email, 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    }
    await expect(login('192.0.2.22', email, 'correct-password')).resolves.toMatchObject({
      staff: { email },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(login('192.0.2.22', email, 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    }
    await expectRateLimited(login('192.0.2.22', email, 'wrong-password'));
  });
});
