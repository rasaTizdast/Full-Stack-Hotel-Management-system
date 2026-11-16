import { SetMetadata } from '@nestjs/common';
import type { StaffCapability } from './staff-capabilities';

export const REQUIRED_STAFF_CAPABILITIES_KEY = 'staff-auth:required-capabilities';

export const RequireStaffCapabilities = (...capabilities: StaffCapability[]) =>
  SetMetadata(REQUIRED_STAFF_CAPABILITIES_KEY, capabilities);
