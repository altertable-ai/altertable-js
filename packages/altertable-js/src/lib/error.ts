import { ApiErrorCode, ApiErrorResponse } from '../types';

/**
 * Base error class for Altertable SDK errors
 */
export class AltertableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AltertableError';
  }
}

/**
 * Error thrown when an API request fails
 */
export class ApiError extends AltertableError {
  constructor(
    public status: number,
    public statusText: string,
    public errorCode?: ApiErrorCode,
    public details?: ApiErrorResponse,
    public requestContext?: {
      url: string;
      method: string;
      payload?: unknown;
    }
  ) {
    super(`HTTP ${status}: ${statusText}${errorCode ? ` (${errorCode})` : ''}`);
    this.name = 'ApiError';
  }
}

/**
 * Error thrown when a network request fails (timeout, connection error, etc.)
 */
export class NetworkError extends AltertableError {
  constructor(
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isAltertableError(error: unknown): error is AltertableError {
  return error instanceof AltertableError;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}
