import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { LoginOriginGuard } from './login-origin.guard';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { PublicRoute } from './public-route.decorator';
import {
  STAFF_CSRF_COOKIE,
  STAFF_SESSION_COOKIE,
  clearStaffCookie,
  serializeStaffCookie,
} from './staff-auth.cookies';
import { StaffAuthService } from './staff-auth.service';
import type { StaffRequest } from './staff-auth.types';

@Controller('staff/auth')
export class StaffAuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: StaffAuthService,
    config: ConfigService,
  ) {
    this.secureCookies = config.get<string>('NODE_ENV') === 'production';
  }

  @PublicRoute()
  @UseGuards(LoginOriginGuard, LoginRateLimitGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto.email, dto.password);
    response.append(
      'Set-Cookie',
      serializeStaffCookie(STAFF_SESSION_COOKIE, result.sessionToken, this.secureCookies),
    );
    response.append(
      'Set-Cookie',
      serializeStaffCookie(STAFF_CSRF_COOKIE, result.csrfToken, this.secureCookies),
    );

    return { staff: result.staff, csrfToken: result.csrfToken };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async currentStaff(@Req() request: StaffRequest, @Res({ passthrough: true }) response: Response) {
    const csrfToken = await this.auth.rotateCsrfToken(request.staffSession!.id);
    response.append(
      'Set-Cookie',
      serializeStaffCookie(STAFF_CSRF_COOKIE, csrfToken, this.secureCookies),
    );
    return { staff: this.auth.toPublicStaff(request.staff!), csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: StaffRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request.staffSession!.id);
    response.append('Set-Cookie', clearStaffCookie(STAFF_SESSION_COOKIE, this.secureCookies));
    response.append('Set-Cookie', clearStaffCookie(STAFF_CSRF_COOKIE, this.secureCookies));
  }
}
