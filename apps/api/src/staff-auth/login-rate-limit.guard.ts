import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { LoginRateLimitService } from './login-rate-limit.service';
import type { StaffRequest } from './staff-auth.types';

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: LoginRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    this.rateLimit.consume(request.ip || request.socket.remoteAddress || 'unknown-client');
    return true;
  }
}
