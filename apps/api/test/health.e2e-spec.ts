import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    prisma.$queryRaw.mockReset().mockResolvedValue([{ result: 1 }]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports process liveness without depending on PostgreSQL', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({ status: 'ok' });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness when PostgreSQL responds', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok', dependencies: { database: 'ok' } });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns an actionable 503 without exposing database errors', async () => {
    await app.close();
    const unavailablePrisma = new PrismaService({
      getOrThrow: () =>
        'postgresql://hotel_test:do-not-return-this@127.0.0.1:1/hotel_booking_test?schema=public',
    } as unknown as ConfigService);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(unavailablePrisma)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(app);
    await app.init();

    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

    expect(response.text).toContain('"statusCode":503');
    expect(response.text).toContain('"code":"DATABASE_UNAVAILABLE"');
    expect(response.text).toContain('pnpm db:up');
    expect(response.text).not.toContain('do-not-return-this');
  });
});
