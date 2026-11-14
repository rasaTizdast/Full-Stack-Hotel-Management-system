import { Controller, Get } from '@nestjs/common';
import { PublicHotelDto } from './dto/public-hotel.dto';
import { HotelService } from './hotel.service';

@Controller('hotel')
export class HotelController {
  constructor(private readonly hotelService: HotelService) {}

  @Get()
  getPublicHotel(): Promise<PublicHotelDto> {
    return this.hotelService.getPublicHotel();
  }
}
