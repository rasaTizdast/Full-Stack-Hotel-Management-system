import { randomUUID } from 'node:crypto';
import { json, urlencoded } from 'express';
import type { ErrorRequestHandler, Request, Response } from 'express';
import {
  BadRequestException,
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import type { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';
import { ValidationError } from 'class-validator';
import { ApiExceptionFilter } from './api-exception.filter';

type RequestWithId = Request & { requestId?: string };

const requestIdMiddleware = (request: RequestWithId, response: Response, next: () => void) => {
  const requestId = randomUUID();
  request.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
};

const parserErrorMiddleware: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const parserError =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const statusCode = typeof parserError.status === 'number' ? parserError.status : 400;
  const requestId = (request as RequestWithId).requestId ?? 'unknown';
  const malformedJson = parserError.type === 'entity.parse.failed';
  const payloadTooLarge = statusCode === 413;

  response.status(malformedJson ? 400 : payloadTooLarge ? 413 : 400).json({
    statusCode: malformedJson ? 400 : payloadTooLarge ? 413 : 400,
    code: malformedJson ? 'MALFORMED_JSON' : payloadTooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
    message: malformedJson
      ? 'The request body contains malformed JSON.'
      : payloadTooLarge
        ? 'The request body is too large.'
        : 'The request body could not be parsed.',
    requestId,
  });
};

const validationMessages: Record<string, string> = {
  whitelistValidation: 'Unknown field is not allowed.',
  isEmail: 'Must be a valid email address.',
  isString: 'Must be a string.',
  minLength: 'Does not meet the minimum length requirement.',
};

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): Array<{ field: string; messages: string[] }> {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const messages = Object.keys(error.constraints ?? {}).map(
      (constraint) => validationMessages[constraint] ?? 'Invalid value.',
    );
    return [
      ...(messages.length > 0 ? [{ field, messages }] : []),
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}

export function configureApiApplication(app: INestApplication): void {
  const webOrigin = new URL(app.get(ConfigService).getOrThrow<string>('WEB_ORIGIN')).origin;
  const allowConfiguredOrigin: CustomOrigin = (requestOrigin, callback) => {
    callback(null, requestOrigin === webOrigin ? webOrigin : false);
  };
  app.enableCors({
    origin: allowConfiguredOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key'],
    exposedHeaders: ['x-request-id'],
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health/(.*)', method: RequestMethod.ALL }],
  });
  app.use(requestIdMiddleware);
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(parserErrorMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          fields: flattenValidationErrors(errors),
        }),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
