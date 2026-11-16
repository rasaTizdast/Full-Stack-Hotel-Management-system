import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { RequireStaffCapabilities } from '../staff-auth/require-staff-capabilities.decorator';
import { StaffStayQueryDto } from './dto/staff-stay-query.dto';
import { StaffStayWorklistDto } from './dto/staff-stay-response.dto';
import { StaffStaysService } from './staff-stays.service';

@ApiTags('Staff front desk')
@ApiCookieAuth('staffSession')
@RequireStaffCapabilities('MANAGE_BOOKINGS')
@Controller('staff/front-desk')
export class StaffStaysController {
  constructor(private readonly stays: StaffStaysService) {}

  @Get('arrivals')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List confirmed due-in stays for the selected property date.' })
  @ApiOkResponse({ type: StaffStayWorklistDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  arrivals(@Query() query: StaffStayQueryDto): Promise<StaffStayWorklistDto> {
    return this.stays.arrivals(query);
  }

  @Get('in-house')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List checked-in stays that have arrived by the selected date.' })
  @ApiOkResponse({ type: StaffStayWorklistDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  inHouse(@Query() query: StaffStayQueryDto): Promise<StaffStayWorklistDto> {
    return this.stays.inHouse(query);
  }

  @Get('departures')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List checked-in stays due to depart on or before the selected date.' })
  @ApiOkResponse({ type: StaffStayWorklistDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  departures(@Query() query: StaffStayQueryDto): Promise<StaffStayWorklistDto> {
    return this.stays.departures(query);
  }
}
