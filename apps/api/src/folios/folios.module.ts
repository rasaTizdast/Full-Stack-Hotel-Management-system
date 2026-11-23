import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../database/prisma.module';
import { FoliosController } from './folios.controller';
import { FoliosService } from './folios.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [FoliosController],
  providers: [FoliosService],
  exports: [FoliosService],
})
export class FoliosModule {}
