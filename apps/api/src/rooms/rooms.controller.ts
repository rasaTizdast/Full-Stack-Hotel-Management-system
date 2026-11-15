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
import { RequireStaffRoles } from '../staff-auth/require-staff-roles.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { StaffRoomsQueryDto } from './dto/staff-rooms-query.dto';
import { StaffRoomDto, StaffRoomListDto } from './dto/staff-room-response.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Staff rooms')
@ApiCookieAuth('staffSession')
@RequireStaffRoles('ADMIN')
@Controller('staff/rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
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

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a physical room for an active room type.' })
  @ApiCreatedResponse({ type: StaffRoomDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  create(@Body() dto: CreateRoomDto): Promise<StaffRoomDto> {
    return this.rooms.create(dto);
  }

  @Patch(':roomId')
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
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<StaffRoomDto> {
    return this.rooms.update(roomId, dto);
  }

  @Post(':roomId/deactivate')
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
  deactivate(@Param('roomId', new ParseUUIDPipe()) roomId: string): Promise<StaffRoomDto> {
    return this.rooms.deactivate(roomId);
  }

  @Post(':roomId/reactivate')
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
  reactivate(@Param('roomId', new ParseUUIDPipe()) roomId: string): Promise<StaffRoomDto> {
    return this.rooms.reactivate(roomId);
  }
}
