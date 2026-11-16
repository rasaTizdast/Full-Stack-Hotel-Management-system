import {
  Body,
  Controller,
  Get,
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
import { ChangeStaffRoleDto } from './dto/change-staff-role.dto';
import { CreateStaffAccountDto } from './dto/create-staff-account.dto';
import { DeactivateStaffAccountDto } from './dto/deactivate-staff-account.dto';
import { StaffAccountDto, StaffAccountListDto } from './dto/staff-account.dto';
import { StaffAccountsQueryDto } from './dto/staff-accounts-query.dto';
import { StaffAdminService } from './staff-admin.service';

@ApiTags('Staff account administration')
@ApiCookieAuth('staffSession')
@RequireStaffCapabilities('MANAGE_STAFF')
@Controller('staff/admin/accounts')
export class StaffAdminController {
  constructor(private readonly staffAdmin: StaffAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'List staff accounts with bounded newest-first pagination.',
    description: 'Page is one-based. Page size defaults to 25 and cannot exceed 100.',
  })
  @ApiOkResponse({ type: StaffAccountListDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  list(@Query() query: StaffAccountsQueryDto): Promise<StaffAccountListDto> {
    return this.staffAdmin.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a named staff account and require a password change at first sign-in.',
    description:
      'Usernames and email addresses are normalized and unique without case sensitivity.',
  })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiCreatedResponse({ type: StaffAccountDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  create(
    @Req() request: StaffRequest,
    @Body() dto: CreateStaffAccountDto,
  ): Promise<StaffAccountDto> {
    return this.staffAdmin.create(request.staff!.id, dto);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change a staff role and record the required reason.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: StaffAccountDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  changeRole(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe()) staffUserId: string,
    @Body() dto: ChangeStaffRoleDto,
  ): Promise<StaffAccountDto> {
    return this.staffAdmin.changeRole(request.staff!.id, staffUserId, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a staff account, revoke its sessions, and record the required reason.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: StaffAccountDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  deactivate(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe()) staffUserId: string,
    @Body() dto: DeactivateStaffAccountDto,
  ): Promise<StaffAccountDto> {
    return this.staffAdmin.deactivate(request.staff!.id, staffUserId, dto);
  }
}
