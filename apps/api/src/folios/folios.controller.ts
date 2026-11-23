import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import {
  AdjustFolioDto,
  CreateServiceItemDto,
  ServiceItemDto,
  ServiceItemListDto,
  PostServiceChargeDto,
  StaffFolioDto,
  UpdateServiceItemDto,
} from './dto/folio.dto';
import { FoliosService } from './folios.service';

@ApiTags('Staff folios and services')
@ApiCookieAuth('staffSession')
@Controller('staff')
export class FoliosController {
  constructor(private readonly folios: FoliosService) {}

  @Get('services')
  @RequireStaffCapabilities('VIEW_FOLIOS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'List active services for posting; managers also see inactive catalog entries.',
  })
  @ApiOkResponse({ type: ServiceItemListDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  listServiceItems(@Req() request: StaffRequest): ReturnType<FoliosService['listServiceItems']> {
    return this.folios.listServiceItems(request.staff!.role);
  }

  @Post('services')
  @RequireStaffCapabilities('MANAGE_SERVICE_CATALOG')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Add an active service with a positive integer-Toman price.' })
  @ApiCreatedResponse({ type: ServiceItemDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  createServiceItem(
    @Req() request: StaffRequest,
    @Body() dto: CreateServiceItemDto,
  ): ReturnType<FoliosService['createServiceItem']> {
    return this.folios.createServiceItem(request.staff!, dto);
  }

  @Patch('services/:serviceItemId')
  @RequireStaffCapabilities('MANAGE_SERVICE_CATALOG')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Change a service snapshot for future postings or activate/deactivate it.',
  })
  @ApiParam({ name: 'serviceItemId', format: 'uuid' })
  @ApiOkResponse({ type: ServiceItemDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  updateServiceItem(
    @Req() request: StaffRequest,
    @Param('serviceItemId', new ParseUUIDPipe()) serviceItemId: string,
    @Body() dto: UpdateServiceItemDto,
  ): ReturnType<FoliosService['updateServiceItem']> {
    return this.folios.updateServiceItem(request.staff!, serviceItemId, dto);
  }

  @Get('folios/:bookingId')
  @RequireStaffCapabilities('VIEW_FOLIOS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read the private append-only stay folio and its server-computed balance.',
  })
  @ApiParam({ name: 'bookingId', format: 'uuid' })
  @ApiOkResponse({ type: StaffFolioDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  getFolio(
    @Req() request: StaffRequest,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
  ): Promise<StaffFolioDto> {
    return this.folios.getFolio(bookingId, request.staff!.role);
  }

  @Post('folios/:bookingId/services')
  @HttpCode(HttpStatus.OK)
  @RequireStaffCapabilities('POST_FOLIO')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Post a service to an in-house stay using a snapshotted catalog price.',
  })
  @ApiParam({ name: 'bookingId', format: 'uuid' })
  @ApiOkResponse({ type: StaffFolioDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  postServiceCharge(
    @Req() request: StaffRequest,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Body() dto: PostServiceChargeDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<StaffFolioDto> {
    return this.folios.postServiceCharge(request.staff!, bookingId, dto, idempotencyKey ?? '');
  }

  @Post('folios/:bookingId/adjustments')
  @HttpCode(HttpStatus.OK)
  @RequireStaffCapabilities('ADJUST_FOLIOS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Append a reasoned compensating entry for an existing non-payment line.',
  })
  @ApiParam({ name: 'bookingId', format: 'uuid' })
  @ApiOkResponse({ type: StaffFolioDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  adjustFolio(
    @Req() request: StaffRequest,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Body() dto: AdjustFolioDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<StaffFolioDto> {
    return this.folios.adjustFolio(request.staff!, bookingId, dto, idempotencyKey ?? '');
  }
}
