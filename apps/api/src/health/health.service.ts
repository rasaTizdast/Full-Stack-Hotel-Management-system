import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async checkReadiness(): Promise<{ status: 'ok'; dependencies: { database: 'ok' } }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database unavailable. Check DATABASE_URL and start PostgreSQL with pnpm db:up.',
      });
    }

    return { status: 'ok', dependencies: { database: 'ok' } };
  }
}
