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
import { RoomBoardDto, RoomBoardQueryDto } from './dto/room-board.dto';
import { RoomBoardService } from './room-board.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { StaffRoomsQueryDto } from './dto/staff-rooms-query.dto';
import { StaffRoomDto, StaffRoomListDto } from './dto/staff-room-response.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Staff rooms')
@ApiCookieAuth('staffSession')
@Controller('staff/rooms')
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly board: RoomBoardService,
  ) {}

  @Get()
  @RequireStaffCapabilities('VIEW_ROOM_BOARD')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'List physical rooms with optional type, floor, active, and search filters.',
  })
  @ApiOkResponse({ type: StaffRoomListDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  list(@Query() query: StaffRoomsQueryDto): Promise<StaffRoomListDto> {
    return this.rooms.list(query);
  }

  @Get('board')
  @RequireStaffCapabilities('VIEW_ROOM_BOARD')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the physical room board for a hotel business date.' })
  @ApiOkResponse({ type: RoomBoardDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getBoard(@Query() query: RoomBoardQueryDto): Promise<RoomBoardDto> {
    return this.board.get(query);
  }

  @Post()
  @RequireStaffCapabilities('MANAGE_ROOM_CATALOG')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a physical room for an active room type.' })
  @ApiCreatedResponse({ type: StaffRoomDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  create(@Req() request: StaffRequest, @Body() dto: CreateRoomDto): Promise<StaffRoomDto> {
    return this.rooms.create(request.staff!.id, dto);
  }

  @Patch(':roomId')
  @RequireStaffCapabilities('MANAGE_ROOM_CATALOG')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update physical room descriptive fields.' })
  @ApiParam({ name: 'roomId', format: 'uuid' })
  @ApiOkResponse({ type: StaffRoomDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  update(
    @Req() request: StaffRequest,
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<StaffRoomDto> {
    return this.rooms.update(request.staff!.id, roomId, dto);
  }

  @Post(':roomId/deactivate')
  @RequireStaffCapabilities('MANAGE_ROOM_CATALOG')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a room when no current/future assignment or reserved inventory conflicts.',
  })
  @ApiParam({ name: 'roomId', format: 'uuid' })
  @ApiOkResponse({ type: StaffRoomDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  deactivate(
    @Req() request: StaffRequest,
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
  ): Promise<StaffRoomDto> {
    return this.rooms.deactivate(request.staff!.id, roomId);
  }

  @Post(':roomId/reactivate')
  @RequireStaffCapabilities('MANAGE_ROOM_CATALOG')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Reactivate a physical room and restore its projected capacity.' })
  @ApiParam({ name: 'roomId', format: 'uuid' })
  @ApiOkResponse({ type: StaffRoomDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  reactivate(
    @Req() request: StaffRequest,
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
  ): Promise<StaffRoomDto> {
    return this.rooms.reactivate(request.staff!.id, roomId);
  }
}
