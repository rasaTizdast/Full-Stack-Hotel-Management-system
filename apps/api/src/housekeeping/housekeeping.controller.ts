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
  AssignHousekeepingTaskDto,
  CompleteHousekeepingTaskDto,
  CreateHousekeepingTaskDto,
  HousekeepingAssigneeListDto,
  HousekeepingTaskDto,
  ReasonDto,
  ReportRoomDiscrepancyDto,
  RoomDiscrepancyDto,
  StaffRoomDiscrepancyListDto,
  StaffDiscrepancyQueryDto,
  StaffHousekeepingRoomOptionsDto,
  StaffHousekeepingTaskListDto,
  StaffHousekeepingTaskQueryDto,
  StaffRoomOptionsQueryDto,
} from './dto/housekeeping.dto';
import { HousekeepingService } from './housekeeping.service';

@ApiTags('Staff housekeeping')
@ApiCookieAuth('staffSession')
@Controller('staff/housekeeping')
export class HousekeepingController {
  constructor(private readonly housekeeping: HousekeepingService) {}

  @Get('tasks')
  @RequireStaffCapabilities('VIEW_HOUSEKEEPING_BOARD')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List housekeeping work for the selected board date.' })
  @ApiOkResponse({ type: StaffHousekeepingTaskListDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  listTasks(
    @Req() request: StaffRequest,
    @Query() query: StaffHousekeepingTaskQueryDto,
  ): Promise<StaffHousekeepingTaskListDto> {
    return this.housekeeping.listTasks(request.staff!, query);
  }

  @Post('tasks')
  @RequireStaffCapabilities('CREATE_HOUSEKEEPING_TASKS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create manual housekeeping work for a physical room.' })
  @ApiCreatedResponse({ type: HousekeepingTaskDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  createTask(@Req() request: StaffRequest, @Body() dto: CreateHousekeepingTaskDto) {
    return this.housekeeping.createTask(request.staff!, dto);
  }

  @Patch('tasks/:taskId/assignment')
  @RequireStaffCapabilities('MANAGE_HOUSEKEEPING_TASKS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Assign or reassign an open task to an active housekeeper.' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiOkResponse({ type: HousekeepingTaskDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  assignTask(
    @Req() request: StaffRequest,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: AssignHousekeepingTaskDto,
  ) {
    return this.housekeeping.assignTask(request.staff!, taskId, dto);
  }

  @Post('tasks/:taskId/start')
  @RequireStaffCapabilities('UPDATE_HOUSEKEEPING')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start an assigned housekeeping task.' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiOkResponse({ type: HousekeepingTaskDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  startTask(@Req() request: StaffRequest, @Param('taskId', new ParseUUIDPipe()) taskId: string) {
    return this.housekeeping.startTask(request.staff!, taskId);
  }

  @Post('tasks/:taskId/complete')
  @RequireStaffCapabilities('UPDATE_HOUSEKEEPING')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a task and apply its housekeeping condition result.' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiOkResponse({ type: HousekeepingTaskDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  completeTask(
    @Req() request: StaffRequest,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: CompleteHousekeepingTaskDto,
  ) {
    return this.housekeeping.completeTask(request.staff!, taskId, dto);
  }

  @Post('tasks/:taskId/cancel')
  @RequireStaffCapabilities('MANAGE_HOUSEKEEPING_TASKS')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel unfinished housekeeping work with a reason.' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiOkResponse({ type: HousekeepingTaskDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  cancelTask(
    @Req() request: StaffRequest,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.housekeeping.cancelTask(request.staff!, taskId, dto.reason);
  }

  @Get('rooms')
  @RequireStaffCapabilities('VIEW_HOUSEKEEPING_BOARD')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List safe room readiness options without guest or folio data.' })
  @ApiOkResponse({ type: StaffHousekeepingRoomOptionsDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  rooms(@Req() request: StaffRequest, @Query() query: StaffRoomOptionsQueryDto) {
    return this.housekeeping.listRooms(request.staff!, query);
  }

  @Get('assignees')
  @RequireStaffCapabilities('MANAGE_HOUSEKEEPING_TASKS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List active housekeepers available for assignment.' })
  @ApiOkResponse({ type: HousekeepingAssigneeListDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  assignees(): Promise<HousekeepingAssigneeListDto> {
    return this.housekeeping.listAssignees();
  }

  @Get('discrepancies')
  @RequireStaffCapabilities('RESOLVE_ROOM_DISCREPANCIES')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List room occupancy discrepancy reports for front-desk review.' })
  @ApiOkResponse({ type: StaffRoomDiscrepancyListDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  discrepancies(@Query() query: StaffDiscrepancyQueryDto) {
    return this.housekeeping.listDiscrepancies(query);
  }

  @Post('rooms/:roomId/discrepancies')
  @RequireStaffCapabilities('UPDATE_HOUSEKEEPING')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Report an occupancy mismatch from assigned room work.' })
  @ApiParam({ name: 'roomId', format: 'uuid' })
  @ApiCreatedResponse({ type: RoomDiscrepancyDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  reportDiscrepancy(
    @Req() request: StaffRequest,
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Body() dto: ReportRoomDiscrepancyDto,
  ) {
    return this.housekeeping.reportDiscrepancy(request.staff!, roomId, dto);
  }

  @Post('discrepancies/:discrepancyId/resolve')
  @RequireStaffCapabilities('RESOLVE_ROOM_DISCREPANCIES')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve an occupancy report after live stay state matches its observation.',
  })
  @ApiParam({ name: 'discrepancyId', format: 'uuid' })
  @ApiOkResponse({ type: RoomDiscrepancyDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  resolveDiscrepancy(
    @Req() request: StaffRequest,
    @Param('discrepancyId', new ParseUUIDPipe()) discrepancyId: string,
  ) {
    return this.housekeeping.resolveDiscrepancy(request.staff!, discrepancyId);
  }

  @Post('discrepancies/:discrepancyId/dismiss')
  @RequireStaffCapabilities('RESOLVE_ROOM_DISCREPANCIES')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss an occupancy report with a staff reason.' })
  @ApiParam({ name: 'discrepancyId', format: 'uuid' })
  @ApiOkResponse({ type: RoomDiscrepancyDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  dismissDiscrepancy(
    @Req() request: StaffRequest,
    @Param('discrepancyId', new ParseUUIDPipe()) discrepancyId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.housekeeping.dismissDiscrepancy(request.staff!, discrepancyId, dto.reason);
  }
}
