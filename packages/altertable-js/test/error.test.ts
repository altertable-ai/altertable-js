import '../../../test-utils/setup';

import { describe, expect, it } from 'vitest';

import {
  AltertableError,
  ApiError,
  isAltertableError,
  isApiError,
  isNetworkError,
  NetworkError,
} from '../src/lib/error';

describe('Error Classes', () => {
  describe('AltertableError', () => {
    it('creates an error with the correct name', () => {
      const error = new AltertableError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AltertableError);
      expect(error.name).toBe('AltertableError');
      expect(error.message).toBe('Test error');
    });
  });

  describe('ApiError', () => {
    it('creates an error with status and statusText', () => {
      const error = new ApiError(404, 'Not Found');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AltertableError);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ApiError');
      expect(error.status).toBe(404);
      expect(error.statusText).toBe('Not Found');
      expect(error.message).toBe('HTTP 404: Not Found');
    });

    it('creates an error with errorCode', () => {
      const error = new ApiError(
        400,
        'Bad Request',
        'environment-not-found'
      );
      expect(error.errorCode).toBe('environment-not-found');
      expect(error.message).toBe('HTTP 400: Bad Request (environment-not-found)');
    });

    it('creates an error with details', () => {
      const details = { error_code: 'invalid-api-key', message: 'API key is invalid' };
      const error = new ApiError(401, 'Unauthorized', 'invalid-api-key', details);
      expect(error.details).toEqual(details);
    });

    it('creates an error with requestContext', () => {
      const requestContext = {
        url: 'https://api.altertable.ai/track',
        method: 'POST',
        payload: { event: 'test' },
      };
      const error = new ApiError(
        500,
        'Internal Server Error',
        undefined,
        undefined,
        requestContext
      );
      expect(error.requestContext).toEqual(requestContext);
    });
  });

  describe('NetworkError', () => {
    it('creates an error with message', () => {
      const error = new NetworkError('Network connection failed');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AltertableError);
      expect(error).toBeInstanceOf(NetworkError);
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Network connection failed');
    });

    it('creates an error with cause', () => {
      const cause = new Error('Connection timeout');
      const error = new NetworkError('Network failed', cause);
      expect(error.cause).toBe(cause);
    });
  });
});

describe('Type Guards', () => {
  describe('isAltertableError', () => {
    it('returns true for AltertableError', () => {
      const error = new AltertableError('test');
      expect(isAltertableError(error)).toBe(true);
    });

    it('returns true for ApiError', () => {
      const error = new ApiError(500, 'Error');
      expect(isAltertableError(error)).toBe(true);
    });

    it('returns true for NetworkError', () => {
      const error = new NetworkError('test');
      expect(isAltertableError(error)).toBe(true);
    });

    it('returns false for regular Error', () => {
      const error = new Error('test');
      expect(isAltertableError(error)).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(isAltertableError('error')).toBe(false);
      expect(isAltertableError(null)).toBe(false);
      expect(isAltertableError(undefined)).toBe(false);
      expect(isAltertableError({ message: 'error' })).toBe(false);
    });
  });

  describe('isApiError', () => {
    it('returns true for ApiError', () => {
      const error = new ApiError(404, 'Not Found');
      expect(isApiError(error)).toBe(true);
    });

    it('returns false for other AltertableErrors', () => {
      expect(isApiError(new AltertableError('test'))).toBe(false);
      expect(isApiError(new NetworkError('test'))).toBe(false);
    });

    it('returns false for regular Error', () => {
      const error = new Error('test');
      expect(isApiError(error)).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(isApiError('error')).toBe(false);
      expect(isApiError(null)).toBe(false);
      expect(isApiError(undefined)).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('returns true for NetworkError', () => {
      const error = new NetworkError('Connection failed');
      expect(isNetworkError(error)).toBe(true);
    });

    it('returns false for other AltertableErrors', () => {
      expect(isNetworkError(new AltertableError('test'))).toBe(false);
      expect(isNetworkError(new ApiError(500, 'Error'))).toBe(false);
    });

    it('returns false for regular Error', () => {
      const error = new Error('test');
      expect(isNetworkError(error)).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(isNetworkError('error')).toBe(false);
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
    });
  });

  describe('Type narrowing', () => {
    it('allows accessing error-specific properties after type guard', () => {
      const error: unknown = new ApiError(404, 'Not Found', 'invalid-request');
      
      if (isApiError(error)) {
        // TypeScript should allow accessing these properties
        expect(error.status).toBe(404);
        expect(error.statusText).toBe('Not Found');
        expect(error.errorCode).toBe('invalid-request');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('allows accessing NetworkError properties after type guard', () => {
      const cause = new Error('Timeout');
      const error: unknown = new NetworkError('Connection failed', cause);
      
      if (isNetworkError(error)) {
        // TypeScript should allow accessing these properties
        expect(error.message).toBe('Connection failed');
        expect(error.cause).toBe(cause);
      } else {
        throw new Error('Type guard failed');
      }
    });
  });
});

