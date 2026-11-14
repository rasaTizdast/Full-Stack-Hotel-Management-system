import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRolesGuard } from './staff-roles.guard';
import type { StaffRequest } from './staff-auth.types';

describe('StaffRolesGuard', () => {
  const handler = () => undefined;
  const controller = class FixtureController {};

  function createContext(staff?: StaffRequest['staff']): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ staff }) }),
    } as unknown as ExecutionContext;
  }

  function createGuard(roles: string[] | undefined): StaffRolesGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as unknown as Reflector;
    return new StaffRolesGuard(reflector);
  }

  it('allows an admin on an admin-only route', () => {
    const guard = createGuard(['ADMIN']);
    const context = createContext({
      id: 'staff-1',
      username: 'admin@example.invalid',
      email: 'admin@example.invalid',
      role: 'ADMIN',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies a receptionist on an admin-only route', () => {
    const guard = createGuard(['ADMIN']);
    const context = createContext({
      id: 'staff-2',
      username: 'reception@example.invalid',
      email: 'reception@example.invalid',
      role: 'RECEPTIONIST',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('requires authentication before applying role policy', () => {
    const guard = createGuard(['RECEPTIONIST']);

    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it('leaves routes without role metadata to the session guard', () => {
    const guard = createGuard(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
  });
});
