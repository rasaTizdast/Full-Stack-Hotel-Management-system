import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BookingRateLimitService } from './booking-rate-limit.service';

@Injectable()
export class BookingRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: BookingRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    this.rateLimit.consume(request.ip || request.socket.remoteAddress || 'unknown-client');
    return true;
  }
}
