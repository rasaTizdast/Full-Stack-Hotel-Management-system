import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../database/prisma.module';
import { LoginOriginGuard } from './login-origin.guard';
import { LoginOriginPolicyService } from './login-origin-policy.service';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffRolesGuard } from './staff-roles.guard';
import { StaffSessionGuard } from './staff-session.guard';

@Module({
  imports: [PrismaModule],
  controllers: [StaffAuthController],
  providers: [
    LoginOriginGuard,
    LoginOriginPolicyService,
    LoginRateLimitGuard,
    LoginRateLimitService,
    StaffAuthService,
    StaffRolesGuard,
    StaffSessionGuard,
    { provide: APP_GUARD, useExisting: StaffSessionGuard },
    { provide: APP_GUARD, useExisting: StaffRolesGuard },
  ],
  exports: [StaffAuthService, StaffRolesGuard, StaffSessionGuard],
})
export class StaffAuthModule {}
