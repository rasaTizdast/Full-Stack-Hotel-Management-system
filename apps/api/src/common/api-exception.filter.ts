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
  PASSWORD_CHANGE_REQUIRED: {
    statusCode: 403,
    message: 'Change your password before accessing staff operations.',
  },
  PASSWORD_REUSE: { statusCode: 400, message: 'Choose a different password.' },
  STAFF_ACCOUNT_EXISTS: { statusCode: 409, message: 'The username or email is already in use.' },
  STAFF_ACCOUNT_NOT_FOUND: { statusCode: 404, message: 'The staff account was not found.' },
  LAST_ACTIVE_ADMIN: {
    statusCode: 409,
    message: 'At least one active administrator account must remain.',
  },
  CAPACITY_BELOW_RESERVED: {
    statusCode: 409,
    message: 'Capacity cannot be lower than held plus booked rooms.',
  },
  HISTORICAL_INVENTORY_READ_ONLY: {
    statusCode: 409,
    message: 'Historical inventory requires an authorized correction workflow.',
  },
  INVALID_DATE_RANGE: {
    statusCode: 400,
    message: 'Use valid Gregorian YYYY-MM-DD dates and checkout after check-in.',
  },
  BUSINESS_DATE_MISMATCH: {
    statusCode: 400,
    message: 'Occupancy reports must use the current hotel business date.',
  },
  CHECK_IN_IN_PAST: { statusCode: 400, message: 'Check-in date must be today or later.' },
  STAY_TOO_LONG: { statusCode: 400, message: 'Stay cannot exceed 30 nights.' },
  INVALID_GUEST_COUNT: {
    statusCode: 400,
    message: 'Guest count must be an integer from 1 to 20.',
  },
  BOOKING_CAPACITY_EXCEEDED: {
    statusCode: 400,
    message: 'Guest count exceeds the selected room capacity.',
  },
  IDEMPOTENCY_KEY_REQUIRED: {
    statusCode: 400,
    message: 'The Idempotency-Key header is required.',
  },
  IDEMPOTENCY_KEY_INVALID: {
    statusCode: 400,
    message: 'The idempotency key must be 16 to 128 valid characters.',
  },
  ROOM_TYPE_NOT_FOUND: {
    statusCode: 404,
    message: 'The selected room type is no longer available.',
  },
  AVAILABILITY_CHANGED: {
    statusCode: 409,
    message: 'Availability changed. Search again before submitting.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    statusCode: 409,
    message: 'Use a new idempotency key when submitting different booking details.',
  },
  BOOKING_NOT_FOUND: { statusCode: 404, message: 'The booking was not found.' },
  BOOKING_STATUS_CONFLICT: {
    statusCode: 409,
    message: 'This booking cannot be changed from its current status.',
  },
  BOOKING_EXPIRED: {
    statusCode: 409,
    message: 'The booking request has expired and can no longer be processed.',
  },
  BOOKING_STAY_STARTED: {
    statusCode: 409,
    message: 'A confirmed booking cannot be cancelled after check-in begins.',
  },
  STAY_AMENDMENT_WINDOW_CLOSED: {
    statusCode: 409,
    message: 'Only confirmed stays arriving today or later can be amended.',
  },
  STAY_EXTENSION_NOT_ALLOWED: {
    statusCode: 403,
    message: 'Only an administrator or manager can extend an in-house stay.',
  },
  STAY_EXTENSION_REASON_REQUIRED: {
    statusCode: 400,
    message: 'A reason is required to extend an in-house stay.',
  },
  STAY_EXTENSION_REASON_INVALID: {
    statusCode: 400,
    message: 'The stay extension reason exceeds its maximum length.',
  },
  STAY_EXTENSION_WINDOW_CLOSED: {
    statusCode: 409,
    message: 'The extension checkout date must include the current hotel business date.',
  },
  STAY_EXTENSION_NOT_LATER: {
    statusCode: 409,
    message: 'The new checkout date must be later than the scheduled checkout date.',
  },
  STAY_EXTENSION_INVENTORY_MISSING: {
    statusCode: 409,
    message: 'Nightly inventory is missing for part of the extension.',
  },
  STAY_OUTSIDE_ROOM_MOVE_WINDOW: {
    statusCode: 409,
    message: 'A room move must take place on a business date inside the stay.',
  },
  ROOM_MOVE_SOURCE_NOT_ASSIGNED: {
    statusCode: 409,
    message:
      'The source assignment is no longer active for this stay on the current business date.',
  },
  ROOM_MOVE_REASON_REQUIRED: { statusCode: 400, message: 'A room move reason is required.' },
  ROOM_MOVE_REASON_INVALID: {
    statusCode: 400,
    message: 'The room move reason exceeds its maximum length.',
  },
  WALK_IN_ARRIVAL_DATE_INVALID: {
    statusCode: 400,
    message: "Walk-ins must arrive on the hotel's current business date.",
  },
  STAY_OUTSIDE_ARRIVAL_WINDOW: {
    statusCode: 409,
    message: 'This stay is not due for arrival on the current business date.',
  },
  EARLY_CHECK_IN_FORBIDDEN: {
    statusCode: 403,
    message: 'Only an administrator or manager can authorize an early check-in.',
  },
  EARLY_CHECK_IN_REASON_REQUIRED: {
    statusCode: 400,
    message: 'An early check-in reason is required.',
  },
  EARLY_CHECK_IN_REASON_INVALID: {
    statusCode: 400,
    message: 'The early check-in reason exceeds its maximum length.',
  },
  NO_SHOW_TOO_EARLY: {
    statusCode: 409,
    message: 'A no-show can be recorded from the configured arrival time.',
  },
  NO_SHOW_REASON_REQUIRED: { statusCode: 400, message: 'A no-show reason is required.' },
  NO_SHOW_REASON_INVALID: {
    statusCode: 400,
    message: 'The no-show reason exceeds its maximum length.',
  },
  CANCELLATION_REASON_REQUIRED: {
    statusCode: 400,
    message: 'A cancellation reason is required for confirmed bookings.',
  },
  CANCELLATION_REASON_INVALID: {
    statusCode: 400,
    message: 'The cancellation reason is invalid or exceeds its maximum length.',
  },
  INTERNAL_NOTE_INVALID: {
    statusCode: 400,
    message: 'The internal note is invalid or exceeds its maximum length.',
  },
  ROOM_NOT_FOUND: { statusCode: 404, message: 'The physical room was not found.' },
  ROOM_INACTIVE: { statusCode: 409, message: 'The physical room is inactive.' },
  ROOM_TYPE_MISMATCH: {
    statusCode: 409,
    message: 'Every assigned room must match the booked room type.',
  },
  ROOM_ASSIGNMENT_OUTSIDE_BOOKING: {
    statusCode: 409,
    message: 'Every assignment interval must be within the booking dates.',
  },
  ROOM_ASSIGNMENT_DUPLICATE_ROOM: {
    statusCode: 409,
    message: 'Each room may appear once in the assignment set.',
  },
  ROOM_ASSIGNMENT_STALE: {
    statusCode: 409,
    message: 'Room assignments changed. Refresh the room board and review the current set.',
  },
  ROOM_ASSIGNMENT_LIMIT: {
    statusCode: 409,
    message: 'The assignment set exceeds the number of booked rooms.',
  },
  ROOM_ASSIGNMENT_INCOMPLETE: {
    statusCode: 409,
    message: 'Assign one distinct room per booked unit for every remaining night.',
  },
  ROOM_NOT_INSPECTED: {
    statusCode: 409,
    message: 'The rooms required for this operation must be inspected.',
  },
  ROOM_ASSIGNMENT_OVERLAP: {
    statusCode: 409,
    message: 'A physical room is already assigned for these dates.',
  },
  ROOM_BLOCKED: { statusCode: 409, message: 'A physical room is blocked for these dates.' },
  ROOM_NUMBER_TAKEN: { statusCode: 409, message: 'A room with this number already exists.' },
  ROOM_HAS_ACTIVE_ASSIGNMENTS: {
    statusCode: 409,
    message: 'Reassign current or future stays before deactivating this room.',
  },
  ROOM_TYPE_INACTIVE: {
    statusCode: 409,
    message: 'Rooms cannot be added to an inactive room type.',
  },
  CARD_DATA_NOT_ALLOWED: {
    statusCode: 400,
    message: 'Cardholder data cannot be stored in a payment reference.',
  },
  FOLIO_PAYMENT_EXCEEDS_BALANCE: {
    statusCode: 409,
    message: 'A payment cannot exceed the folio balance.',
  },
  FOLIO_HAS_NO_POSITIVE_BALANCE: {
    statusCode: 409,
    message: 'There is no positive balance to collect.',
  },
  FOLIO_NOT_COLLECTIBLE: {
    statusCode: 409,
    message: 'This folio cannot accept a payment.',
  },
  FOLIO_NOT_OPEN: { statusCode: 409, message: 'This folio has already been closed.' },
  SOURCE_PAYMENT_NOT_FOUND: { statusCode: 404, message: 'The source payment was not found.' },
  REFUND_EXCEEDS_SOURCE_PAYMENT: {
    statusCode: 409,
    message: 'The refund exceeds the unrefunded payment.',
  },
  FOLIO_BALANCE_NOT_SETTLED: {
    statusCode: 409,
    message: 'Ordinary checkout requires the folio balance to be zero.',
  },
  FOLIO_CREDIT_REQUIRES_REFUND: {
    statusCode: 409,
    message: 'A credit balance must be resolved with a reasoned refund before checkout.',
  },
  STAY_ALREADY_CHECKED_OUT: { statusCode: 409, message: 'This stay has already been checked out.' },
  ON_ACCOUNT_CHECKOUT_FORBIDDEN: {
    statusCode: 403,
    message: 'Only a manager or administrator can approve checkout with a receivable.',
  },
  ON_ACCOUNT_REASON_REQUIRED: {
    statusCode: 400,
    message: 'A reason is required to check out with a receivable balance.',
  },
  CHECKOUT_BEFORE_CHECK_IN: {
    statusCode: 409,
    message: 'The stay cannot be checked out before arrival.',
  },
  STAY_EXTENSION_REQUIRED: {
    statusCode: 409,
    message: 'The scheduled stay must be extended before checkout.',
  },
  ROOM_ASSIGNMENT_REQUIRED: {
    statusCode: 409,
    message: 'The in-house stay has no active room assignment.',
  },
  INVENTORY_NIGHT_NOT_FOUND: {
    statusCode: 409,
    message: 'Future inventory is missing for this stay.',
  },
  BOOKED_INVENTORY_MISMATCH: {
    statusCode: 409,
    message: 'Future booked inventory could not be released.',
  },
  BUSINESS_DATE_CHANGED: {
    statusCode: 409,
    message: 'The hotel business date changed. Refresh the operations preview.',
  },
  PREVIOUS_CLOSE_INCOMPLETE: {
    statusCode: 409,
    message: 'A previous night-close run is unfinished.',
  },
  NIGHT_CLOSE_BLOCKED: {
    statusCode: 409,
    message: 'Resolve the listed close blockers before continuing.',
  },
  NIGHT_CLOSE_CONFIRMATION_STALE: {
    statusCode: 409,
    message: 'The close preview changed. Review the current date, charges, advance, and warnings.',
  },
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    if (request.path === '/api/v1/staff' || request.path.startsWith('/api/v1/staff/')) {
      response.setHeader('Cache-Control', 'private, no-store');
    }
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
