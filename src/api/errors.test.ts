import { SchemaValidationError } from 'ky';

import { ApiError, shouldRetryRequest, toApiError } from './errors';

// Mimics ky's HTTPError without a real Request/Response (ky's guards also match on name + brand).
function httpError(status: number, data?: unknown) {
  return Object.assign(new Error('HTTP error'), {
    name: 'HTTPError',
    isKyError: true,
    response: { status },
    data,
  });
}

describe('toApiError', () => {
  it('maps 401 to unauthorized', () => {
    expect(toApiError(httpError(401)).code).toBe('unauthorized');
  });

  it('keeps the status, server message and server code for other HTTP errors', () => {
    const error = toApiError(
      httpError(409, {
        code: 'ATTEMPT_CLOSED',
        message: 'This attempt has already been submitted',
      }),
    );
    expect(error).toMatchObject({
      code: 'http',
      status: 409,
      serverCode: 'ATTEMPT_CLOSED',
      serverMessage: 'This attempt has already been submitted',
    });
  });

  it('maps schema failures to validation', () => {
    expect(toApiError(new SchemaValidationError([])).code).toBe('validation');
  });

  it('wraps unknown values', () => {
    const error = toApiError('boom');
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('unknown');
  });

  it('returns ApiError instances unchanged', () => {
    const original = new ApiError('timeout');
    expect(toApiError(original)).toBe(original);
  });
});

describe('shouldRetryRequest', () => {
  it('never retries client errors', () => {
    expect(shouldRetryRequest(0, httpError(404))).toBe(false);
    expect(shouldRetryRequest(0, httpError(401))).toBe(false);
  });

  it('retries server errors twice', () => {
    expect(shouldRetryRequest(0, httpError(503))).toBe(true);
    expect(shouldRetryRequest(1, httpError(503))).toBe(true);
    expect(shouldRetryRequest(2, httpError(503))).toBe(false);
  });
});
