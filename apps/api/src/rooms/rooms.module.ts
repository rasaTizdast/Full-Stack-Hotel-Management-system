import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../database/prisma.module';
import { RoomAssignmentController } from './room-assignment.controller';
import { RoomAssignmentService } from './room-assignment.service';
import { RoomBoardService } from './room-board.service';
import { RoomCapacityService } from './room-capacity.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [RoomsController, RoomAssignmentController],
  providers: [RoomCapacityService, RoomsService, RoomAssignmentService, RoomBoardService],
  exports: [RoomCapacityService, RoomAssignmentService],
})
export class RoomsModule {}
