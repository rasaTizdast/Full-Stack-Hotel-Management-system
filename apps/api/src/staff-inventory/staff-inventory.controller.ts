import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { RequireStaffRoles } from '../staff-auth/require-staff-roles.decorator';
import { StaffInventoryRangeQueryDto } from './dto/staff-inventory-range-query.dto';
import {
  StaffInventoryResponseDto,
  StaffInventoryRoomTypeOptionDto,
} from './dto/staff-inventory-response.dto';
import { UpdateStaffInventoryDto } from './dto/update-staff-inventory.dto';
import { StaffInventoryService } from './staff-inventory.service';

@ApiTags('Staff inventory')
@ApiCookieAuth('staffSession')
@Controller('staff/inventory')
export class StaffInventoryController {
  constructor(private readonly staffInventory: StaffInventoryService) {}

  @RequireStaffRoles('ADMIN')
  @Get('room-types')
  @ApiOperation({ summary: 'List active and inactive room types for the admin inventory editor.' })
  @ApiOkResponse({ type: StaffInventoryRoomTypeOptionDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Administrator access is required.',
  })
  findRoomTypeOptions(): Promise<StaffInventoryRoomTypeOptionDto[]> {
    return this.staffInventory.findRoomTypeOptions();
  }

  @RequireStaffRoles('ADMIN', 'RECEPTIONIST')
  @Get()
  @ApiOperation({
    summary: 'Read room-night inventory for a date range.',
    description: 'Dates use Gregorian YYYY-MM-DD values; endDate is exclusive.',
  })
  @ApiOkResponse({ type: StaffInventoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  findRange(@Query() query: StaffInventoryRangeQueryDto): Promise<StaffInventoryResponseDto> {
    return this.staffInventory.findRange(query);
  }

  @RequireStaffRoles('ADMIN')
  @Put()
  @ApiOperation({
    summary: 'Set capacity and nightly price for a room type and date range.',
    description: 'Dates use Gregorian YYYY-MM-DD values; endDate is exclusive.',
  })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: StaffInventoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Capacity cannot be lower than held plus booked rooms.',
  })
  updateRange(@Body() dto: UpdateStaffInventoryDto): Promise<StaffInventoryResponseDto> {
    return this.staffInventory.updateRange(dto);
  }
}
