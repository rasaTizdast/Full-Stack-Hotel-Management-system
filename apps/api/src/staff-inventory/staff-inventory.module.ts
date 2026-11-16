import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../database/prisma.module';
import { StaffInventoryController } from './staff-inventory.controller';
import { StaffInventoryService } from './staff-inventory.service';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [PrismaModule, RoomsModule, AuditModule],
  controllers: [StaffInventoryController],
  providers: [StaffInventoryService],
})
export class StaffInventoryModule {}
