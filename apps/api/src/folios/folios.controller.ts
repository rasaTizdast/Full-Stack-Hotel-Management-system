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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { RequireStaffCapabilities } from '../staff-auth/require-staff-capabilities.decorator';
import type { StaffRequest } from '../staff-auth/staff-auth.types';
import {
  AdjustFolioDto,
  CheckoutFolioDto,
  CreateServiceItemDto,
  ServiceItemDto,
  ServiceItemListDto,
  PostServiceChargeDto,
  RecordFolioPaymentDto,
  RefundFolioPaymentDto,
  StaffFolioDto,
  StaffFolioLookupDto,
  StaffFolioLookupQueryDto,
  StaffFolioPrintDto,
  UpdateServiceItemDto,
} from './dto/folio.dto';
import { FoliosService } from './folios.service';

@ApiTags('Staff folios and services')
@ApiCookieAuth('staffSession')
@Controller('staff')
export class FoliosController {
  constructor(private readonly folios: FoliosService) {}

  @Get('folios/lookup')
  @RequireStaffCapabilities('VIEW_FOLIOS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Find an in-house or outstanding receivable folio by exact booking reference.',
  })
  @ApiQuery({ name: 'reference', required: true, minLength: 8, maxLength: 16 })
  @ApiOkResponse({ type: StaffFolioLookupDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  lookupFolio(@Query() query: StaffFolioLookupQueryDto): Promise<StaffFolioLookupDto> {
    return this.folios.lookupFolio(query.reference);
  }

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

  @Get('folios/:bookingId/print')
  @RequireStaffCapabilities('VIEW_FOLIOS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read a private interim or final folio for browser printing.' })
  @ApiParam({ name: 'bookingId', format: 'uuid' })
  @ApiOkResponse({ type: StaffFolioPrintDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  getFolioPrint(
    @Req() request: StaffRequest,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
  ): Promise<StaffFolioPrintDto> {
    return this.folios.getFolioPrint(bookingId, request.staff!.role);
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

  @Post('folios/:bookingId/payments')
  @HttpCode(HttpStatus.OK)
  @RequireStaffCapabilities('POST_FOLIO')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Record a cash, terminal, transfer, or other offline payment.' })
  @ApiParam({ name: 'bookingId', format: 'uuid' })
  @ApiOkResponse({ type: StaffFolioDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  recordPayment(
    @Req() request: StaffRequest,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Body() dto: RecordFolioPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<StaffFolioDto> {
    return this.folios.recordPayment(request.staff!, bookingId, dto, idempotencyKey ?? '');
  }

  @Post('folios/:bookingId/refunds')
  @HttpCode(HttpStatus.OK)
  @RequireStaffCapabilities('ADJUST_FOLIOS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Append a reasoned partial refund linked to a source payment.' })
  @ApiParam({ name: 'bookingId', format: 'uuid' })
  @ApiOkResponse({ type: StaffFolioDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  refundPayment(
    @Req() request: StaffRequest,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Body() dto: RefundFolioPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<StaffFolioDto> {
    return this.folios.refundPayment(request.staff!, bookingId, dto, idempotencyKey ?? '');
  }

  @Post('folios/:bookingId/checkout')
  @HttpCode(HttpStatus.OK)
  @RequireStaffCapabilities('CHECKOUT')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Post final room nights, settle the folio, and check out atomically.' })
  @ApiParam({ name: 'bookingId', format: 'uuid' })
  @ApiOkResponse({ type: StaffFolioDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  checkout(
    @Req() request: StaffRequest,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Body() dto: CheckoutFolioDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<StaffFolioDto> {
    return this.folios.checkout(request.staff!, bookingId, dto, idempotencyKey ?? '');
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
