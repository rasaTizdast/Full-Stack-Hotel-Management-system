import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/openapi-response.dto';
import { LivenessResponseDto, ReadinessResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Check whether the API process is running.' })
  @ApiOkResponse({ type: LivenessResponseDto })
  checkLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check API and database readiness.' })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({
    type: ApiErrorResponseDto,
    description: 'The database is unavailable.',
  })
  checkReadiness(): Promise<{ status: 'ok'; dependencies: { database: 'ok' } }> {
    return this.healthService.checkReadiness();
  }
}
