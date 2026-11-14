import { Controller, Get } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { PublicHotelDto } from './dto/public-hotel.dto';
import { HotelService } from './hotel.service';

@ApiTags('Public catalog')
@Controller('hotel')
export class HotelController {
  constructor(private readonly hotelService: HotelService) {}

  @Get()
  @ApiOperation({ summary: 'Get the public hotel profile.' })
  @ApiOkResponse({ type: PublicHotelDto })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: 'The hotel profile is not configured.',
  })
  getPublicHotel(): Promise<PublicHotelDto> {
    return this.hotelService.getPublicHotel();
  }
}
