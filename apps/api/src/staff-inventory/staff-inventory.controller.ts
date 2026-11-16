import { Body, Controller, Get, Header, Put, Query, Req } from '@nestjs/common';
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
import { RequireStaffCapabilities } from '../staff-auth/require-staff-capabilities.decorator';
import type { StaffRequest } from '../staff-auth/staff-auth.types';
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

  @RequireStaffCapabilities('MANAGE_INVENTORY')
  @Get('room-types')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List active and inactive room types for the staff inventory editor.' })
  @ApiOkResponse({ type: StaffInventoryRoomTypeOptionDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Staff without inventory-management capability are not allowed.',
  })
  findRoomTypeOptions(): Promise<StaffInventoryRoomTypeOptionDto[]> {
    return this.staffInventory.findRoomTypeOptions();
  }

  @RequireStaffCapabilities('MANAGE_INVENTORY')
  @Get()
  @Header('Cache-Control', 'private, no-store')
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

  @RequireStaffCapabilities('MANAGE_INVENTORY')
  @Put()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Set nightly prices for a room type and date range.',
    description:
      'Dates use Gregorian YYYY-MM-DD values; endDate is exclusive. Physical capacity is derived from active rooms and dated blocks.',
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
  updateRange(
    @Req() request: StaffRequest,
    @Body() dto: UpdateStaffInventoryDto,
  ): Promise<StaffInventoryResponseDto> {
    return this.staffInventory.updateRange(dto, request.staff!.id);
  }
}
