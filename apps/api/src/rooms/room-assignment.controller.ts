import { Body, Controller, Header, Param, Put, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { StaffBookingParamsDto } from '../bookings/dto/staff-booking-params.dto';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { RequireStaffCapabilities } from '../staff-auth/require-staff-capabilities.decorator';
import type { StaffRequest } from '../staff-auth/staff-auth.types';
import { ReplaceRoomAssignmentsDto, RoomAssignmentSetDto } from './dto/room-assignment.dto';
import { RoomAssignmentService } from './room-assignment.service';

@ApiTags('Staff room assignments')
@ApiCookieAuth('staffSession')
@Controller('staff/bookings/:reference/room-assignments')
export class RoomAssignmentController {
  constructor(private readonly assignments: RoomAssignmentService) {}

  @Put()
  @RequireStaffCapabilities('MANAGE_BOOKINGS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Reconcile the complete physical room assignment set for a confirmed booking.',
  })
  @ApiOkResponse({ type: RoomAssignmentSetDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  replace(
    @Req() request: StaffRequest,
    @Param() { reference }: StaffBookingParamsDto,
    @Body() dto: ReplaceRoomAssignmentsDto,
  ): Promise<RoomAssignmentSetDto> {
    return this.assignments.replace(request.staff!.id, reference, dto);
  }
}
