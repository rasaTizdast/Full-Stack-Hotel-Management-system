import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  checkLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  checkReadiness(): Promise<{ status: 'ok'; dependencies: { database: 'ok' } }> {
    return this.healthService.checkReadiness();
  }
}
