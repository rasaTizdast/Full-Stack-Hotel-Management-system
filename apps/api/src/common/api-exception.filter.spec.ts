import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter safe availability errors', () => {
  function getResponseFor(exception: BadRequestException, path = '/') {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn((payload: unknown) => payload),
      setHeader: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'request-123', path }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter().catch(exception, host);
    return response;
  }

  it.each([
    ['INVALID_DATE_RANGE', 'Use valid Gregorian YYYY-MM-DD dates and checkout after check-in.'],
    ['CHECK_IN_IN_PAST', 'Check-in date must be today or later.'],
    ['STAY_TOO_LONG', 'Stay cannot exceed 30 nights.'],
    ['INVALID_GUEST_COUNT', 'Guest count must be an integer from 1 to 20.'],
  ])('preserves the approved safe message for %s', (code, message) => {
    const response = getResponseFor(
      new BadRequestException({ code, message: 'untrusted caller-controlled message' }),
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      code,
      message,
      requestId: 'request-123',
    });
  });

  it('keeps unknown error payloads generic and does not reflect their message', () => {
    const response = getResponseFor(
      new BadRequestException({ code: 'UNREVIEWED_CODE', message: 'sensitive caller data' }),
    );

    const payload = response.json.mock.calls[0]?.[0];
    expect(payload).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'The request is invalid.',
      requestId: 'request-123',
    });
    expect(JSON.stringify(payload)).not.toContain('sensitive caller data');
  });

  it('marks staff API errors private and non-cacheable', () => {
    const response = getResponseFor(
      new BadRequestException('Bad request.'),
      '/api/v1/staff/admin/accounts',
    );

    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});
