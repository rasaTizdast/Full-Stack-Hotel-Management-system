import { Controller, Get, Query } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { AvailabilityResponseDto } from './dto/availability-response.dto';
import { parseAvailabilityCriteria } from './date-range';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  search(@Query() query: AvailabilityQueryDto): Promise<AvailabilityResponseDto> {
    return this.availabilityService.search(parseAvailabilityCriteria(query));
  }
}
