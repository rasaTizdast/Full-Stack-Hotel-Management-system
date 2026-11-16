import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../database/prisma.module';
import { RoomCapacityService } from './room-capacity.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [RoomsController],
  providers: [RoomCapacityService, RoomsService],
  exports: [RoomCapacityService],
})
export class RoomsModule {}
