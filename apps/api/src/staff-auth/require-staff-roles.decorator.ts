import { SetMetadata } from '@nestjs/common';
import type { StaffRole } from './staff-auth.types';

export const REQUIRED_STAFF_ROLES_KEY = 'staff-auth:required-roles';

export const RequireStaffRoles = (...roles: StaffRole[]) =>
  SetMetadata(REQUIRED_STAFF_ROLES_KEY, roles);
