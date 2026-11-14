import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicRoomTypeDto } from './dto/public-room-type.dto';
import { RoomTypesService } from './room-types.service';

@ApiTags('Public catalog')
@Controller('room-types')
export class RoomTypesController {
  constructor(private readonly roomTypesService: RoomTypesService) {}

  @Get()
  @ApiOperation({ summary: 'List active public room types.' })
  @ApiOkResponse({ type: PublicRoomTypeDto, isArray: true })
  getActiveRoomTypes(): Promise<PublicRoomTypeDto[]> {
    return this.roomTypesService.getActivePublicRoomTypes();
  }
}
