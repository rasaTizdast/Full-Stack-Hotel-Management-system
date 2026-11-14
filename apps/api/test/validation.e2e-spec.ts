import { Body, Controller, Injectable, LoggerService, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';

class ValidationFixtureDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;
}

@Injectable()
class ValidationFixtureService {
  submit(dto: ValidationFixtureDto): { accepted: true; email: string } {
    return { accepted: true, email: dto.email };
  }

  crash(): never {
    throw new Error('password=sensitive-password-from-the-request');
  }
}

@Controller('validation-fixture')
class ValidationFixtureController {
  constructor(private readonly service: ValidationFixtureService) {}

  @Post()
  submit(@Body() dto: ValidationFixtureDto): { accepted: true; email: string } {
    return this.service.submit(dto);
  }

  @Post('crash')
  crash(): never {
    return this.service.crash();
  }
}

describe('API validation and errors (e2e)', () => {
  let app: INestApplication<App>;
  let service: ValidationFixtureService;
  let submitSpy: jest.SpyInstance;
  const capturedLogs: string[] = [];
  const logger = {
    log: (...messages: unknown[]) => capturedLogs.push(messages.map(String).join(' ')),
    error: (...messages: unknown[]) => capturedLogs.push(messages.map(String).join(' ')),
    warn: (...messages: unknown[]) => capturedLogs.push(messages.map(String).join(' ')),
    debug: (...messages: unknown[]) => capturedLogs.push(messages.map(String).join(' ')),
    verbose: (...messages: unknown[]) => capturedLogs.push(messages.map(String).join(' ')),
    fatal: (...messages: unknown[]) => capturedLogs.push(messages.map(String).join(' ')),
  } satisfies LoggerService;

  beforeEach(async () => {
    capturedLogs.length = 0;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationFixtureController],
      providers: [ValidationFixtureService],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.useLogger(logger);
    configureApiApplication(app);
    service = moduleFixture.get(ValidationFixtureService);
    submitSpy = jest.spyOn(service, 'submit');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts a valid DTO and only returns the public result', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-fixture')
      .set('x-request-id', 'client-selected-id')
      .send({ email: 'guest@example.com', password: 'valid-example-password' })
      .expect(201);

    expect(response.text).toContain('"accepted":true');
    expect(response.text).toContain('guest@example.com');
    expect(response.text).not.toContain('valid-example-password');
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.headers['x-request-id']).not.toBe('client-selected-id');
  });

  it('rejects invalid fields before calling the service and returns field details', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-fixture')
      .send({ email: 'invalid-email', password: 'short' })
      .expect(400);

    expect(response.text).toContain('"code":"VALIDATION_ERROR"');
    expect(response.text).toContain('"field":"email"');
    expect(response.text).toContain('"field":"password"');
    expect(response.text).toContain('"messages":');
    expect(response.text).not.toContain('invalid-email');
    expect(response.text).not.toContain('short');
    expect(response.text).toContain('"requestId":');
    expect(response.text).toContain(response.headers['x-request-id']);
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('rejects unknown properties without echoing or logging sensitive values', async () => {
    const secret = 'never-log-this-sensitive-password';
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-fixture')
      .send({
        email: 'guest@example.com',
        password: 'valid-example-password',
        admin: secret,
      })
      .expect(400);

    expect(response.text).toContain('"code":"VALIDATION_ERROR"');
    expect(response.text).toContain('"field":"admin"');
    expect(response.text).not.toContain(secret);
    expect(capturedLogs.join('\n')).not.toContain(secret);
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('returns a request ID and stable error for malformed JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-fixture')
      .set('content-type', 'application/json')
      .send('{"password":"malformed-json-secret",')
      .expect(400);

    expect(response.text).toContain('"code":"MALFORMED_JSON"');
    expect(response.text).toContain('"requestId":');
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.text).toContain(response.headers['x-request-id']);
    expect(response.text).not.toContain('malformed-json-secret');
    expect(capturedLogs.join('\n')).not.toContain('malformed-json-secret');
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('returns a safe internal error and logs request context without exception text', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-fixture/crash')
      .send({ password: 'sensitive-password-from-the-request' })
      .expect(500);

    expect(response.text).toContain('"code":"INTERNAL_SERVER_ERROR"');
    expect(response.text).toContain('An unexpected error occurred.');
    expect(response.text).not.toContain('sensitive-password-from-the-request');
    expect(response.text).not.toContain('password=sensitive-password-from-the-request');
    expect(capturedLogs.join('\n')).toContain(response.headers['x-request-id']);
    expect(capturedLogs.join('\n')).not.toContain('sensitive-password-from-the-request');
  });

  it('returns the stable not-found error shape for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(response.text).toContain('"code":"NOT_FOUND"');
    expect(response.text).toContain('"requestId":');
    expect(response.text).toContain(response.headers['x-request-id']);
  });
});
