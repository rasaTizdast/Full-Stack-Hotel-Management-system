import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { StaffAuthResponseDto } from './dto/staff-auth-response.dto';
import { LoginOriginGuard } from './login-origin.guard';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { getLoginClientIp } from './login-rate-limit.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import { PublicRoute } from './public-route.decorator';
import {
  STAFF_CSRF_COOKIE,
  STAFF_SESSION_COOKIE,
  clearStaffCookie,
  serializeStaffCookie,
} from './staff-auth.cookies';
import { StaffAuthService } from './staff-auth.service';
import type { StaffRequest } from './staff-auth.types';

@ApiTags('Staff authentication')
@Controller('staff/auth')
export class StaffAuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: StaffAuthService,
    config: ConfigService,
    private readonly rateLimit: LoginRateLimitService,
  ) {
    this.secureCookies = config.get<string>('NODE_ENV') === 'production';
  }

  @PublicRoute()
  @UseGuards(LoginOriginGuard, LoginRateLimitGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in a staff user.',
    description:
      'Login enforces same-origin checks against WEB_ORIGIN. Because Swagger UI is served from the API origin, browser Try it out requests are expected to receive 403. Use the web app at /staff/login for interactive browser sign-in; non-browser clients must set both Origin and Referer to WEB_ORIGIN. Development credentials are configured with DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD.',
  })
  @ApiHeader({ name: 'Origin', required: true, example: 'http://localhost:3000' })
  @ApiHeader({ name: 'Referer', required: true, example: 'http://localhost:3000/staff/login' })
  @ApiOkResponse({
    type: StaffAuthResponseDto,
    description: 'Sets the staff session and CSRF cookies.',
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'The browser origin is not allowed.',
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'The credentials are invalid.',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() request: StaffRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const clientIp = getLoginClientIp(request);
    this.rateLimit.assertIdentityAllowed(clientIp, dto.email);

    let result: Awaited<ReturnType<StaffAuthService['login']>>;
    try {
      result = await this.auth.login(dto.email, dto.password);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.rateLimit.recordFailure(clientIp, dto.email);
      } else {
        this.rateLimit.releaseAttempt(clientIp, dto.email);
      }
      throw error;
    }

    this.rateLimit.recordSuccess(clientIp, dto.email);
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
  @ApiCookieAuth('staffSession')
  @ApiOperation({ summary: 'Get the signed-in staff profile and rotate the CSRF token.' })
  @ApiOkResponse({ type: StaffAuthResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async currentStaff(@Req() request: StaffRequest, @Res({ passthrough: true }) response: Response) {
    const csrfToken = await this.auth.rotateCsrfToken(request.staffSession!.id);
    response.append(
      'Set-Cookie',
      serializeStaffCookie(STAFF_CSRF_COOKIE, csrfToken, this.secureCookies),
    );
    return { staff: this.auth.toPublicStaff(request.staff!), csrfToken };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('staffSession')
  @ApiOperation({
    summary: 'Change the current staff password and clear any forced-change requirement.',
    description: 'Requires the current password, the staff session cookie, and a CSRF token.',
  })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'The password was changed.' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async changePassword(
    @Req() request: StaffRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(
      request.staff!.id,
      request.staffSession!.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('staffSession')
  @ApiOperation({ summary: 'Sign out and revoke the current staff session.' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true, description: 'Must match the CSRF cookie.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'The session was revoked.' })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'A valid CSRF token is required.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async logout(
    @Req() request: StaffRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request.staffSession!.id);
    response.append('Set-Cookie', clearStaffCookie(STAFF_SESSION_COOKIE, this.secureCookies));
    response.append('Set-Cookie', clearStaffCookie(STAFF_CSRF_COOKIE, this.secureCookies));
  }
}
