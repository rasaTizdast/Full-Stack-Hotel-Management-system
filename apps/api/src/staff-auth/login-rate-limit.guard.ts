import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { LoginRateLimitService } from './login-rate-limit.service';
import type { StaffRequest } from './staff-auth.types';

export function getLoginClientIp(request: Pick<StaffRequest, 'ip' | 'socket'>): string {
  return request.ip || request.socket?.remoteAddress || 'unknown-client';
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: LoginRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    this.rateLimit.assertIpAllowed(getLoginClientIp(request));
    return true;
  }
}
