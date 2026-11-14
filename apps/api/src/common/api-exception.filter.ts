import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

type ApiError = {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  fields?: Array<{ field: string; messages: string[] }>;
};

type RequestWithId = Request & { requestId?: string };

const SAFE_MESSAGES: Record<number, { code: string; message: string }> = {
  500: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
  400: { code: 'BAD_REQUEST', message: 'The request is invalid.' },
  401: { code: 'UNAUTHORIZED', message: 'Authentication is required.' },
  403: { code: 'FORBIDDEN', message: 'You are not allowed to perform this action.' },
  404: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  409: { code: 'CONFLICT', message: 'The request conflicts with the current state.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'The request media type is not supported.' },
  422: { code: 'UNPROCESSABLE_ENTITY', message: 'The request could not be processed.' },
  429: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests.' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
};

const SAFE_DOMAIN_ERRORS: Record<string, { statusCode: number; message: string }> = {
  INVALID_DATE_RANGE: {
    statusCode: 400,
    message: 'Use valid Gregorian YYYY-MM-DD dates and checkout after check-in.',
  },
  CHECK_IN_IN_PAST: { statusCode: 400, message: 'Check-in date must be today or later.' },
  STAY_TOO_LONG: { statusCode: 400, message: 'Stay cannot exceed 30 nights.' },
  INVALID_GUEST_COUNT: {
    statusCode: 400,
    message: 'Guest count must be an integer from 1 to 20.',
  },
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : 500;
    const requestId = request.requestId ?? 'unknown';
    const error = this.toApiError(exception, statusCode, requestId);

    if (statusCode >= 500) {
      const errorName = exception instanceof Error ? exception.name : 'UnknownError';
      this.logger.error(`requestId=${requestId} errorType=${errorName} statusCode=${statusCode}`);
    }

    response.status(statusCode).json(error);
  }

  private toApiError(exception: unknown, statusCode: number, requestId: string): ApiError {
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const payload = exceptionResponse as Record<string, unknown>;

        if (payload.code === 'VALIDATION_ERROR' && Array.isArray(payload.fields)) {
          return {
            statusCode,
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            requestId,
            fields: payload.fields as ApiError['fields'],
          };
        }

        if (payload.code === 'DATABASE_UNAVAILABLE') {
          return {
            statusCode,
            code: 'DATABASE_UNAVAILABLE',
            message:
              'Database unavailable. Check DATABASE_URL and start PostgreSQL with pnpm db:up.',
            requestId,
          };
        }

        if (typeof payload.code === 'string') {
          const safeDomainError = SAFE_DOMAIN_ERRORS[payload.code];
          if (safeDomainError?.statusCode === statusCode) {
            return {
              statusCode,
              code: payload.code,
              message: safeDomainError.message,
              requestId,
            };
          }
        }
      }
    }

    if (statusCode === 500) {
      return {
        statusCode,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      };
    }

    const safeError = SAFE_MESSAGES[statusCode] ?? {
      code: 'BAD_REQUEST',
      message: 'The request could not be processed.',
    };
    return { statusCode, ...safeError, requestId };
  }
}
