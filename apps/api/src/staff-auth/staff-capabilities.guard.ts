import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_STAFF_CAPABILITIES_KEY } from './require-staff-capabilities.decorator';
import { staffHasCapability } from './staff-capabilities';
import type { StaffRequest } from './staff-auth.types';

@Injectable()
export class StaffCapabilitiesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Parameters<typeof staffHasCapability>[1][]>(
      REQUIRED_STAFF_CAPABILITIES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const staff = context.switchToHttp().getRequest<StaffRequest>().staff;
    if (!staff) throw new UnauthorizedException('Authentication is required.');
    if (!required.every((capability) => staffHasCapability(staff.role, capability))) {
      throw new ForbiddenException('You are not allowed to perform this action.');
    }
    return true;
  }
}
