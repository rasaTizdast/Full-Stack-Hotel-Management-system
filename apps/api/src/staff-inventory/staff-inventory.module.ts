import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { StaffInventoryController } from './staff-inventory.controller';
import { StaffInventoryService } from './staff-inventory.service';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [PrismaModule, RoomsModule],
  controllers: [StaffInventoryController],
  providers: [StaffInventoryService],
})
export class StaffInventoryModule {}
