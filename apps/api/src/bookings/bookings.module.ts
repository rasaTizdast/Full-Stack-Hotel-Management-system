import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../database/prisma.module';
import { BookingRateLimitGuard } from './booking-rate-limit.guard';
import { BookingRateLimitService } from './booking-rate-limit.service';
import { BookingsController } from './bookings.controller';
import { BookingExpiryWorker } from './booking-expiry.worker';
import { BookingsService } from './bookings.service';
import { StaffBookingsController } from './staff-bookings.controller';
import { StaffBookingsService } from './staff-bookings.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BookingsController, StaffBookingsController],
  providers: [
    BookingRateLimitGuard,
    BookingRateLimitService,
    BookingsService,
    BookingExpiryWorker,
    StaffBookingsService,
  ],
})
export class BookingsModule {}
