import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { RequireStaffCapabilities } from '../staff-auth/require-staff-capabilities.decorator';
import type { StaffRequest } from '../staff-auth/staff-auth.types';
import { StaffBookingActionDto, CancelStaffBookingDto } from './dto/staff-booking-action.dto';
import { StaffBookingParamsDto } from './dto/staff-booking-params.dto';
import { StaffBookingsQueryDto } from './dto/staff-bookings-query.dto';
import { StaffBookingDetailDto, StaffBookingListDto } from './dto/staff-booking-response.dto';
import { StaffBookingsService } from './staff-bookings.service';

@ApiTags('Staff booking requests')
@ApiCookieAuth('staffSession')
@RequireStaffCapabilities('MANAGE_BOOKINGS')
@Controller('staff/bookings')
export class StaffBookingsController {
  constructor(private readonly staffBookings: StaffBookingsService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter booking requests.' })
  @ApiOkResponse({ type: StaffBookingListDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'A filter value is invalid.' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  list(@Query() query: StaffBookingsQueryDto): Promise<StaffBookingListDto> {
    return this.staffBookings.list(query);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'Get a booking request and its guest/stay details.' })
  @ApiOkResponse({ type: StaffBookingDetailDto })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: 'The booking reference is invalid.',
  })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'The booking was not found.' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  get(@Param() params: StaffBookingParamsDto): Promise<StaffBookingDetailDto> {
    return this.staffBookings.get(params.reference);
  }

  @Post(':reference/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a pending booking request.' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: StaffBookingDetailDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The request can no longer be confirmed.',
  })
  confirm(
    @Req() request: StaffRequest,
    @Param() params: StaffBookingParamsDto,
    @Body() dto: StaffBookingActionDto,
  ): Promise<StaffBookingDetailDto> {
    return this.staffBookings.transition(
      params.reference,
      'CONFIRM',
      {
        internalNote: dto.internalNote,
      },
      request.staff!.id,
    );
  }

  @Post(':reference/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending booking request and release its held inventory.' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: StaffBookingDetailDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The request can no longer be rejected.',
  })
  reject(
    @Req() request: StaffRequest,
    @Param() params: StaffBookingParamsDto,
    @Body() dto: StaffBookingActionDto,
  ): Promise<StaffBookingDetailDto> {
    return this.staffBookings.transition(
      params.reference,
      'REJECT',
      {
        internalNote: dto.internalNote,
      },
      request.staff!.id,
    );
  }

  @Post(':reference/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a confirmed booking and release its inventory.' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: StaffBookingDetailDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  cancel(
    @Req() request: StaffRequest,
    @Param() params: StaffBookingParamsDto,
    @Body() dto: CancelStaffBookingDto,
  ): Promise<StaffBookingDetailDto> {
    return this.staffBookings.transition(
      params.reference,
      'CANCEL',
      {
        cancellationReason: dto.reason,
      },
      request.staff!.id,
    );
  }
}
