import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { LoginOriginPolicyService } from './login-origin-policy.service';
import type { StaffRequest } from './staff-auth.types';

@Injectable()
export class LoginOriginGuard implements CanActivate {
  constructor(private readonly originPolicy: LoginOriginPolicyService) {}

  canActivate(context: ExecutionContext): boolean {
    this.originPolicy.assertSameOrigin(context.switchToHttp().getRequest<StaffRequest>());
    return true;
  }
}
