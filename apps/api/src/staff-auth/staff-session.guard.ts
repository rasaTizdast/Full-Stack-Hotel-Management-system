import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { constantTimeEqual, hashCredential } from './credential-hash';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';
import { STAFF_CSRF_COOKIE, STAFF_SESSION_COOKIE, readCookie } from './staff-auth.cookies';
import type { StaffRequest } from './staff-auth.types';

const STAFF_API_PREFIX = '/api/v1/staff/';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const FORCED_PASSWORD_CHANGE_ROUTES = new Set([
  '/api/v1/staff/auth/me',
  '/api/v1/staff/auth/change-password',
  '/api/v1/staff/auth/logout',
]);

@Injectable()
export class StaffSessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<StaffRequest>();
    if (!request.path.startsWith(STAFF_API_PREFIX)) {
      return true;
    }

    const rawSessionToken = readCookie(request.headers.cookie, STAFF_SESSION_COOKIE);
    if (!rawSessionToken) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const session = await this.prisma.staffSession.findFirst({
      where: {
        tokenHash: hashCredential(rawSessionToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        staffUser: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            isActive: true,
            mustChangePassword: true,
          },
        },
      },
    });
    if (!session || !session.staffUser.isActive) {
      throw new UnauthorizedException('Authentication is required.');
    }

    request.staff = {
      id: session.staffUser.id,
      username: session.staffUser.username,
      email: session.staffUser.email,
      role: session.staffUser.role,
      mustChangePassword: session.staffUser.mustChangePassword,
    };
    request.staffSession = { id: session.id, csrfTokenHash: session.csrfTokenHash };

    if (!SAFE_METHODS.has(request.method.toUpperCase())) {
      const csrfCookie = readCookie(request.headers.cookie, STAFF_CSRF_COOKIE);
      const csrfHeader = request.get('x-csrf-token');
      if (
        !constantTimeEqual(csrfCookie, csrfHeader) ||
        !constantTimeEqual(
          csrfHeader ? hashCredential(csrfHeader) : undefined,
          session.csrfTokenHash,
        )
      ) {
        throw new ForbiddenException('A valid CSRF token is required.');
      }
    }

    if (session.staffUser.mustChangePassword && !FORCED_PASSWORD_CHANGE_ROUTES.has(request.path)) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change your password before accessing staff operations.',
      });
    }

    return true;
  }
}
