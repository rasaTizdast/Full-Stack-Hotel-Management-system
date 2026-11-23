import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { RequireStaffCapabilities } from '../staff-auth/require-staff-capabilities.decorator';
import type { StaffRequest } from '../staff-auth/staff-auth.types';
import {
  AssignMaintenanceRequestDto,
  CreateMaintenanceRequestDto,
  CreateRoomBlockDto,
  MaintenanceAssigneeListDto,
  MaintenanceRoomListDto,
  MaintenanceRequestDto,
  MaintenanceRequestListDto,
  MaintenanceRequestQueryDto,
  ResolveMaintenanceRequestDto,
  RestoreRoomBlockDto,
  RoomBlockDto,
  RoomBlockListDto,
  RoomBlockQueryDto,
} from './dto/maintenance.dto';
import { MaintenanceService } from './maintenance.service';

@ApiTags('Staff maintenance')
@ApiCookieAuth('staffSession')
@Controller('staff/maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('assignees')
  @RequireStaffCapabilities('MANAGE_MAINTENANCE')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List active staff who can receive a maintenance assignment.' })
  @ApiOkResponse({ type: MaintenanceAssigneeListDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  listAssignees(): Promise<MaintenanceAssigneeListDto> {
    return this.maintenance.listAssignees();
  }

  @Get('rooms')
  @RequireStaffCapabilities('CREATE_MAINTENANCE_REQUESTS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List active physical rooms for filing a maintenance request.' })
  @ApiOkResponse({ type: MaintenanceRoomListDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  listRooms(): Promise<MaintenanceRoomListDto> {
    return this.maintenance.listRooms();
  }

  @Get('requests')
  @RequireStaffCapabilities('VIEW_MAINTENANCE')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List filtered maintenance requests without guest or folio data.' })
  @ApiOkResponse({ type: MaintenanceRequestListDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  listRequests(@Query() query: MaintenanceRequestQueryDto): Promise<MaintenanceRequestListDto> {
    return this.maintenance.listRequests(query);
  }

  @Post('requests')
  @RequireStaffCapabilities('CREATE_MAINTENANCE_REQUESTS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a repair request without blocking room inventory.' })
  @ApiCreatedResponse({ type: MaintenanceRequestDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  createRequest(
    @Req() request: StaffRequest,
    @Body() dto: CreateMaintenanceRequestDto,
  ): Promise<MaintenanceRequestDto> {
    return this.maintenance.createRequest(request.staff!, dto);
  }

  @Patch('requests/:requestId/assignment')
  @RequireStaffCapabilities('MANAGE_MAINTENANCE')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Assign or reassign an open maintenance request.' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiOkResponse({ type: MaintenanceRequestDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  assignRequest(
    @Req() request: StaffRequest,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: AssignMaintenanceRequestDto,
  ): Promise<MaintenanceRequestDto> {
    return this.maintenance.assignRequest(request.staff!, requestId, dto);
  }

  @Post('requests/:requestId/resolve')
  @RequireStaffCapabilities('MANAGE_MAINTENANCE')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a maintenance request while preserving its history.' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiOkResponse({ type: MaintenanceRequestDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  resolveRequest(
    @Req() request: StaffRequest,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: ResolveMaintenanceRequestDto,
  ): Promise<MaintenanceRequestDto> {
    return this.maintenance.resolveRequest(request.staff!, requestId, dto);
  }

  @Get('blocks')
  @RequireStaffCapabilities('VIEW_MAINTENANCE')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List dated out-of-order and capacity-closed room blocks.' })
  @ApiOkResponse({ type: RoomBlockListDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  listBlocks(@Query() query: RoomBlockQueryDto): Promise<RoomBlockListDto> {
    return this.maintenance.listBlocks(query);
  }

  @Post('blocks')
  @RequireStaffCapabilities('MANAGE_MAINTENANCE')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Block a room for an exclusive-end date range.' })
  @ApiCreatedResponse({ type: RoomBlockDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  createBlock(
    @Req() request: StaffRequest,
    @Body() dto: CreateRoomBlockDto,
  ): Promise<RoomBlockDto> {
    return this.maintenance.createBlock(request.staff!, dto);
  }

  @Post('blocks/:blockId/restore')
  @RequireStaffCapabilities('MANAGE_MAINTENANCE')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore room capacity before or after a block end date.' })
  @ApiParam({ name: 'blockId', format: 'uuid' })
  @ApiOkResponse({ type: RoomBlockDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  restoreBlock(
    @Req() request: StaffRequest,
    @Param('blockId', new ParseUUIDPipe()) blockId: string,
    @Body() dto: RestoreRoomBlockDto,
  ): Promise<RoomBlockDto> {
    return this.maintenance.restoreBlock(request.staff!, blockId, dto);
  }
}
