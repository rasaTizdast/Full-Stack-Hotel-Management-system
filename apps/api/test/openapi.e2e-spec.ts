import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApplication } from '../src/common/configure-api-application';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOpenApiDocument(value: unknown): value is OpenAPIObject {
  return (
    isRecord(value) &&
    typeof value.openapi === 'string' &&
    isRecord(value.info) &&
    isRecord(value.paths)
  );
}

describe('OpenAPI documentation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a development Swagger UI and an accurate OpenAPI contract', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);

    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const rawDocument: unknown = JSON.parse(response.text);
    if (!isOpenApiDocument(rawDocument)) {
      throw new Error('The API returned an invalid OpenAPI document.');
    }

    expect(rawDocument.openapi).toMatch(/^3\./);
    expect(rawDocument.info).toMatchObject({
      title: 'Hotel Booking Engine API',
      version: '1.0.0',
    });
    const documentedRoutes: Array<{
      path: string;
      method: 'get' | 'post' | 'put';
    }> = [
      { path: '/api/v1/hotel', method: 'get' },
      { path: '/api/v1/room-types', method: 'get' },
      { path: '/api/v1/availability', method: 'get' },
      { path: '/api/v1/bookings', method: 'post' },
      { path: '/api/v1/staff/auth/login', method: 'post' },
      { path: '/api/v1/staff/auth/me', method: 'get' },
      { path: '/api/v1/staff/auth/logout', method: 'post' },
      { path: '/api/v1/staff/bookings', method: 'get' },
      { path: '/api/v1/staff/inventory', method: 'get' },
      { path: '/api/v1/staff/inventory', method: 'put' },
      { path: '/api/v1/staff/inventory/room-types', method: 'get' },
      { path: '/health/live', method: 'get' },
      { path: '/health/ready', method: 'get' },
    ];
    for (const route of documentedRoutes) {
      expect(rawDocument.paths[route.path]?.[route.method]).toBeDefined();
    }

    const bookingOperation = rawDocument.paths['/api/v1/bookings']?.post;
    if (!bookingOperation) throw new Error('The booking operation is missing from OpenAPI.');
    const bookingBody = bookingOperation.requestBody;
    const bookingBodySchema =
      bookingBody && 'content' in bookingBody
        ? bookingBody.content['application/json']?.schema
        : undefined;
    expect(
      bookingBodySchema && '$ref' in bookingBodySchema ? bookingBodySchema.$ref : undefined,
    ).toBe('#/components/schemas/CreateBookingDto');

    const createdResponse = bookingOperation.responses['201'];
    const bookingResponseSchema =
      createdResponse && 'content' in createdResponse
        ? createdResponse.content?.['application/json']?.schema
        : undefined;
    expect(
      bookingResponseSchema && '$ref' in bookingResponseSchema
        ? bookingResponseSchema.$ref
        : undefined,
    ).toBe('#/components/schemas/BookingResponseDto');
    expect(
      bookingOperation.parameters?.some(
        (parameter) =>
          'name' in parameter && parameter.name === 'Idempotency-Key' && parameter.required,
      ),
    ).toBe(true);

    expect(rawDocument.paths['/api/v1/staff/bookings']?.get?.security).toEqual([
      { staffSession: [] },
    ]);
    expect(rawDocument.paths['/api/v1/staff/auth/login']?.post?.security).toBeUndefined();
    const loginDescription = rawDocument.paths['/api/v1/staff/auth/login']?.post?.description;
    expect(loginDescription).toContain('browser Try it out requests are expected to receive 403');
    expect(loginDescription).toContain('/staff/login');
    expect(loginDescription).toContain('WEB_ORIGIN');
    expect(rawDocument.components?.securitySchemes?.staffSession).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'hotel_staff_session',
    });
    expect(rawDocument.paths['/api/v1/staff/inventory']?.put?.parameters).toContainEqual(
      expect.objectContaining({ name: 'X-CSRF-Token', in: 'header', required: true }),
    );

    const roomMove = rawDocument.paths['/api/v1/staff/bookings/{reference}/room-move']?.post;
    expect(roomMove?.requestBody).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/MoveStaffRoomDto' } },
      },
    });
    expect(rawDocument.components?.schemas?.MoveStaffRoomDto).toMatchObject({
      required: ['sourceAssignmentId', 'targetRoomId', 'reason'],
      properties: { sourceAssignmentId: { type: 'string', format: 'uuid' } },
    });
    const sourceSchema = rawDocument.components?.schemas?.MoveStaffRoomDto;
    expect(isRecord(sourceSchema) ? sourceSchema.properties : undefined).not.toHaveProperty(
      'sourceRoomId',
    );
    const assignedRoomSchema = rawDocument.components?.schemas?.StaffStayAssignedRoomDto;
    expect(isRecord(assignedRoomSchema) ? assignedRoomSchema.required : undefined).toContain(
      'assignmentId',
    );
    expect(assignedRoomSchema).toMatchObject({
      properties: { assignmentId: { type: 'string', format: 'uuid' } },
    });

    const createBookingSchema = rawDocument.components?.schemas?.CreateBookingDto;
    const createBookingProperties = isRecord(createBookingSchema)
      ? createBookingSchema.properties
      : undefined;
    const guestPhoneSchema = isRecord(createBookingProperties)
      ? createBookingProperties.guestPhone
      : undefined;
    expect(guestPhoneSchema).toMatchObject({
      pattern: '^\\+989\\d{9}$',
      example: '+989121234567',
    });
  });
});
