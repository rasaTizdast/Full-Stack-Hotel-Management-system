import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { StaffInventoryController } from './staff-inventory.controller';
import { StaffInventoryService } from './staff-inventory.service';

@Module({
  imports: [PrismaModule],
  controllers: [StaffInventoryController],
  providers: [StaffInventoryService],
})
export class StaffInventoryModule {}
