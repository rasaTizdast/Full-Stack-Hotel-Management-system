import { Controller, Get } from '@nestjs/common';
import { PublicRoomTypeDto } from './dto/public-room-type.dto';
import { RoomTypesService } from './room-types.service';

@Controller('room-types')
export class RoomTypesController {
  constructor(private readonly roomTypesService: RoomTypesService) {}

  @Get()
  getActiveRoomTypes(): Promise<PublicRoomTypeDto[]> {
    return this.roomTypesService.getActivePublicRoomTypes();
  }
}
