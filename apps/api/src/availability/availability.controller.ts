import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { AvailabilityService } from './availability.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { AvailabilityResponseDto } from './dto/availability-response.dto';
import { parseAvailabilityCriteria } from './date-range';

@ApiTags('Availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary: 'Search room availability and prices.',
    description:
      'Dates are Gregorian YYYY-MM-DD values. Checkout is exclusive; a stay can be at most 30 nights.',
  })
  @ApiOkResponse({ type: AvailabilityResponseDto })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: 'The date range or guest count is invalid.',
  })
  search(@Query() query: AvailabilityQueryDto): Promise<AvailabilityResponseDto> {
    return this.availabilityService.search(parseAvailabilityCriteria(query));
  }
}
