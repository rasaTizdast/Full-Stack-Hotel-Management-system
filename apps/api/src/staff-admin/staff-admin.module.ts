import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../database/prisma.module';
import { StaffAdminController } from './staff-admin.controller';
import { StaffAdminService } from './staff-admin.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [StaffAdminController],
  providers: [StaffAdminService],
})
export class StaffAdminModule {}
