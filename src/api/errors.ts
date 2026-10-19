import type { TFunction } from 'i18next';
import { isHTTPError, isNetworkError, isTimeoutError, SchemaValidationError } from 'ky';

export type ApiErrorCode =
  'network' | 'timeout' | 'unauthorized' | 'http' | 'validation' | 'unknown';

/** Single error shape for the whole app — UI code never needs to know about ky. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  /** `message` field from the server's JSON body, when it sends one. */
  readonly serverMessage?: string;
  /** Stable machine-readable `code` from the server's JSON body, e.g. `ATTEMPT_EXPIRED`. */
  readonly serverCode?: string;

  constructor(
    code: ApiErrorCode,
    options: { status?: number; serverMessage?: string; serverCode?: string; cause?: unknown } = {},
  ) {
    super(options.serverMessage ?? code, { cause: options.cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status;
    this.serverMessage = options.serverMessage;
    this.serverCode = options.serverCode;
  }
}

function readServerField(data: unknown, field: 'message' | 'code'): string | undefined {
  if (typeof data === 'object' && data !== null && field in data) {
    const value = (data as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isHTTPError(error)) {
    const status = error.response.status;
    return new ApiError(status === 401 ? 'unauthorized' : 'http', {
      status,
      serverMessage: readServerField(error.data, 'message'),
      serverCode: readServerField(error.data, 'code'),
      cause: error,
    });
  }
  if (isTimeoutError(error)) return new ApiError('timeout', { cause: error });
  if (isNetworkError(error)) return new ApiError('network', { cause: error });
  if (error instanceof SchemaValidationError) return new ApiError('validation', { cause: error });
  return new ApiError('unknown', { cause: error });
}

/** TanStack Query retry policy: retry transient failures only, never 4xx or bad payloads. */
export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  const { code, status } = toApiError(error);
  if (code === 'unauthorized' || code === 'validation') return false;
  if (code === 'http' && status !== undefined && status < 500) return false;
  return failureCount < 2;
}

/** Human-readable, translated message for any thrown value. */
export function describeError(error: unknown, t: TFunction): string {
  const apiError = toApiError(error);
  if (apiError.serverMessage) return apiError.serverMessage;
  return t(`errors.${apiError.code}`, { status: apiError.status });
}
