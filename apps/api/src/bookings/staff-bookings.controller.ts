import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { RequireStaffRoles } from '../staff-auth/require-staff-roles.decorator';
import { StaffBookingActionDto, CancelStaffBookingDto } from './dto/staff-booking-action.dto';
import { StaffBookingParamsDto } from './dto/staff-booking-params.dto';
import { StaffBookingsQueryDto } from './dto/staff-bookings-query.dto';
import type { StaffBookingDetailDto, StaffBookingListDto } from './dto/staff-booking-response.dto';
import { StaffBookingsService } from './staff-bookings.service';

@RequireStaffRoles('ADMIN', 'RECEPTIONIST')
@Controller('staff/bookings')
export class StaffBookingsController {
  constructor(private readonly staffBookings: StaffBookingsService) {}

  @Get()
  list(@Query() query: StaffBookingsQueryDto): Promise<StaffBookingListDto> {
    return this.staffBookings.list(query);
  }

  @Get(':reference')
  get(@Param() params: StaffBookingParamsDto): Promise<StaffBookingDetailDto> {
    return this.staffBookings.get(params.reference);
  }

  @Post(':reference/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param() params: StaffBookingParamsDto,
    @Body() dto: StaffBookingActionDto,
  ): Promise<StaffBookingDetailDto> {
    return this.staffBookings.transition(params.reference, 'CONFIRM', {
      internalNote: dto.internalNote,
    });
  }

  @Post(':reference/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param() params: StaffBookingParamsDto,
    @Body() dto: StaffBookingActionDto,
  ): Promise<StaffBookingDetailDto> {
    return this.staffBookings.transition(params.reference, 'REJECT', {
      internalNote: dto.internalNote,
    });
  }

  @Post(':reference/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param() params: StaffBookingParamsDto,
    @Body() dto: CancelStaffBookingDto,
  ): Promise<StaffBookingDetailDto> {
    return this.staffBookings.transition(params.reference, 'CANCEL', {
      cancellationReason: dto.reason,
    });
  }
}
