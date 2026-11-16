import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../database/prisma.module';
import { LoginOriginGuard } from './login-origin.guard';
import { LoginOriginPolicyService } from './login-origin-policy.service';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffCapabilitiesGuard } from './staff-capabilities.guard';
import { StaffRolesGuard } from './staff-roles.guard';
import { StaffSessionGuard } from './staff-session.guard';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [StaffAuthController],
  providers: [
    LoginOriginGuard,
    LoginOriginPolicyService,
    LoginRateLimitGuard,
    LoginRateLimitService,
    StaffAuthService,
    StaffRolesGuard,
    StaffCapabilitiesGuard,
    StaffSessionGuard,
    { provide: APP_GUARD, useExisting: StaffSessionGuard },
    { provide: APP_GUARD, useExisting: StaffRolesGuard },
    { provide: APP_GUARD, useExisting: StaffCapabilitiesGuard },
  ],
  exports: [StaffAuthService, StaffRolesGuard, StaffSessionGuard],
})
export class StaffAuthModule {}
