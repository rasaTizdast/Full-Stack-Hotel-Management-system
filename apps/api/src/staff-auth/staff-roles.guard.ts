import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_STAFF_ROLES_KEY } from './require-staff-roles.decorator';
import type { StaffRequest, StaffRole } from './staff-auth.types';

@Injectable()
export class StaffRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[]>(REQUIRED_STAFF_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) {
      return true;
    }

    const staff = context.switchToHttp().getRequest<StaffRequest>().staff;
    if (!staff) {
      throw new UnauthorizedException('Authentication is required.');
    }
    if (!requiredRoles.includes(staff.role)) {
      throw new ForbiddenException('You are not allowed to perform this action.');
    }
    return true;
  }
}
