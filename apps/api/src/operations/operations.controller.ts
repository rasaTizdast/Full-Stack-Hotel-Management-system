import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { RequireStaffCapabilities } from '../staff-auth/require-staff-capabilities.decorator';
import type { StaffRequest } from '../staff-auth/staff-auth.types';
import {
  NightClosePreviewDto,
  NightCloseResultDto,
  RunNightCloseDto,
  StaffOperationsReportDto,
  StaffReportQueryDto,
} from './dto/operations.dto';
import { OperationsService } from './operations.service';

@ApiTags('Staff operations and reports')
@ApiCookieAuth('staffSession')
@Controller('staff')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('operations/close')
  @RequireStaffCapabilities('NIGHT_CLOSE_REPORTS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Preview blockers, warnings, and accommodation charges for night close.',
  })
  @ApiOkResponse({ type: NightClosePreviewDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  previewClose(): Promise<NightClosePreviewDto> {
    return this.operations.previewClose();
  }

  @Post('operations/close')
  @HttpCode(HttpStatus.OK)
  @RequireStaffCapabilities('NIGHT_CLOSE_REPORTS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Run a confirmed, all-or-nothing manual night close.' })
  @ApiOkResponse({ type: NightCloseResultDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  runNightClose(
    @Req() request: StaffRequest,
    @Body() dto: RunNightCloseDto,
  ): Promise<NightCloseResultDto> {
    return this.operations.runNightClose(request.staff!, dto);
  }

  @Get('reports')
  @RequireStaffCapabilities('NIGHT_CLOSE_REPORTS')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read manager operations and financial summaries for a business date.' })
  @ApiOkResponse({ type: StaffOperationsReportDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  getReport(@Query() query: StaffReportQueryDto): Promise<StaffOperationsReportDto> {
    return this.operations.getReport(query.date);
  }
}
