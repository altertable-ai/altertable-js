import '../../../test-utils/matchers/toRequestApi';
import '../../../test-utils/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  setupBeaconAvailable,
  setupBeaconUnavailable,
} from '../../../test-utils/networkMode';
import { ApiError, NetworkError } from '../src/lib/error';
import { Requester, type RequesterConfig } from '../src/lib/requester';
import { EventPayload, IdentifyPayload, TrackPayload } from '../src/types';

function createTrackEventPayload(
  overrides: Partial<TrackPayload> = {}
): TrackPayload {
  return {
    event: 'Event Tracked',
    timestamp: new Date().toISOString(),
    properties: {},
    environment: 'test',
    device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
    anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    session_id: 'session-0197d9df-4e77-72cb-bf0a-e35b3f1f5425',
    ...overrides,
  };
}

function createIdentifyEventPayload(
  overrides: Partial<IdentifyPayload> = {}
): IdentifyPayload {
  return {
    traits: { email: 'test@example.com' },
    environment: 'test',
    device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
    anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    ...overrides,
  };
}

function createRequester(overrides: Partial<RequesterConfig> = {}) {
  const defaultConfig: RequesterConfig = {
    baseUrl: 'https://api.altertable.ai',
    apiKey: 'test-api-key',
    requestTimeout: 5_000,
    maxHttpAttempts: 1,
    ...overrides,
  };
  return new Requester(defaultConfig);
}

describe('Requester', () => {
  let requester: Requester<EventPayload>;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockSendBeacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setupBeaconAvailable();

    mockFetch = global.fetch as any;
    mockSendBeacon = global.navigator.sendBeacon as any;

    requester = createRequester();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      const customRequester = createRequester({
        baseUrl: 'https://custom.api.com',
        apiKey: 'custom-api-key',
        requestTimeout: 15_000,
      });

      expect(customRequester['_config'].baseUrl).toBe('https://custom.api.com');
      expect(customRequester['_config'].apiKey).toBe('custom-api-key');
      expect(customRequester['_config'].requestTimeout).toBe(15_000);
    });
  });

  describe('URL construction', () => {
    it('should properly encode API key in URL', async () => {
      const customRequester = createRequester({
        apiKey: 'test-api-key with spaces & special chars',
      });

      await customRequester.sendBatch('/track', [
        createTrackEventPayload(),
      ]);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        'https://api.altertable.ai/track?apiKey=test-api-key%20with%20spaces%20%26%20special%20chars'
      );
    });

    it('should construct correct URLs for different endpoints', async () => {
      await requester.sendBatch('/identify', [
        createIdentifyEventPayload() as EventPayload,
      ]);
      await requester.sendBatch('/track', [createTrackEventPayload()]);

      const identifyUrl = mockFetch.mock.calls[0][0];
      const trackUrl = mockFetch.mock.calls[1][0];

      expect(identifyUrl).toBe(
        'https://api.altertable.ai/identify?apiKey=test-api-key'
      );
      expect(trackUrl).toBe(
        'https://api.altertable.ai/track?apiKey=test-api-key'
      );
    });
  });

  describe('sendBatch() fetch transport', () => {
    it('should use fetch with keepalive for sendBatch (not sendBeacon)', async () => {
      await requester.sendBatch('/track', [createTrackEventPayload()]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSendBeacon).toHaveBeenCalledTimes(0);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(options.keepalive).toBe(true);
    });

    it('should POST a JSON array body', async () => {
      const first = createTrackEventPayload({ event: 'a' });
      const second = createTrackEventPayload({ event: 'b' });

      await requester.sendBatch('/track', [first, second]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const parsed = JSON.parse(options.body);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toEqual([first, second]);
    });

    it('should serialize a single-event batch as a one-element JSON array', async () => {
      const payload = createTrackEventPayload();

      await requester.sendBatch('/track', [payload]);

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual([payload]);
    });

    it('should no-op on empty batch', async () => {
      await requester.sendBatch('/track', []);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('clamps maxHttpAttempts below 1 to a single attempt', async () => {
      const singleAttemptRequester = createRequester({ maxHttpAttempts: 0 });

      await singleAttemptRequester.sendBatch('/track', [createTrackEventPayload()]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendUnload()', () => {
    it('should no-op when payloads are empty', () => {
      requester.sendUnload('/track', []);

      expect(mockSendBeacon).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use sendBeacon when available', () => {
      const first = createTrackEventPayload({ event: 'a' });
      const second = createTrackEventPayload({ event: 'b' });

      requester.sendUnload('/track', [first, second]);

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(0);
      const [url, blob] = mockSendBeacon.mock.calls[0];
      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(blob).toBeInstanceOf(Blob);
    });

    it('should fall back to fetch keepalive when sendBeacon returns false', () => {
      mockSendBeacon.mockReturnValue(false);
      const payload = createTrackEventPayload();

      requester.sendUnload('/track', [payload]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.keepalive).toBe(true);
      expect(JSON.parse(options.body)).toEqual([payload]);
    });

    it('should fall back to fetch keepalive when sendBeacon throws', () => {
      mockSendBeacon.mockImplementation(() => {
        throw new Error('sendBeacon failed');
      });
      const payload = createTrackEventPayload();

      requester.sendUnload('/track', [payload]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.keepalive).toBe(true);
      expect(JSON.parse(options.body)).toEqual([payload]);
    });
  });

  describe('fetch fallback behavior', () => {
    beforeEach(() => {
      setupBeaconUnavailable();
      mockFetch = global.fetch as any;
    });

    it('should use fetch when sendBeacon is not available', async () => {
      await requester.sendBatch('/track', [createTrackEventPayload()]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSendBeacon).toHaveBeenCalledTimes(0);
    });

    it('sendUnload uses fetch keepalive when sendBeacon is not available', () => {
      const payload = createTrackEventPayload();

      requester.sendUnload('/track', [payload]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.keepalive).toBe(true);
      expect(JSON.parse(options.body)).toEqual([payload]);
    });

    it('should configure fetch with correct options', async () => {
      await requester.sendBatch('/track', [createTrackEventPayload()]);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.keepalive).toBe(true);
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('should serialize batch payload as JSON string in fetch', async () => {
      const payload = createTrackEventPayload();

      await requester.sendBatch('/track', [payload]);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify([payload]));
    });

    it('should handle fetch network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        requester.sendBatch('/track', [createTrackEventPayload()])
      ).rejects.toThrow('Network error');
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: async () => ({}),
      });

      await expect(
        requester.sendBatch('/track', [createTrackEventPayload()])
      ).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('should handle 429 HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers(),
        json: async () => ({}),
      });

      await expect(
        requester.sendBatch('/track', [createTrackEventPayload()])
      ).rejects.toThrow('HTTP 429: Too Many Requests');
    });

    it('should parse error_code from 400 response body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        json: async () => ({
          error_code: 'environment-not-found',
        }),
      });

      await expect(
        requester.sendBatch('/track', [createTrackEventPayload()])
      ).rejects.toThrow(ApiError);

      try {
        await requester.sendBatch('/track', [createTrackEventPayload()]);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(400);
        expect((error as ApiError).statusText).toBe('Bad Request');
        expect((error as ApiError).errorCode).toBe('environment-not-found');
        expect((error as ApiError).details).toEqual({
          error_code: 'environment-not-found',
        });
      }
    });

    it('should handle 400 response without error_code', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        json: async () => ({
          some_field: 'some_value',
        }),
      });

      try {
        await requester.sendBatch('/track', [createTrackEventPayload()]);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(400);
        expect((error as ApiError).statusText).toBe('Bad Request');
        expect((error as ApiError).errorCode).toBeUndefined();
        expect((error as ApiError).details).toEqual({
          some_field: 'some_value',
        });
      }
    });

    it('should handle response with unparseable JSON body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      try {
        await requester.sendBatch('/track', [createTrackEventPayload()]);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(500);
        expect((error as ApiError).statusText).toBe('Internal Server Error');
        expect((error as ApiError).errorCode).toBeUndefined();
        expect((error as ApiError).details).toBeUndefined();
      }
    });

    it('should include requestContext in ApiError', async () => {
      const payload = createTrackEventPayload();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        json: async () => ({
          error_code: 'invalid-request',
        }),
      });

      try {
        await requester.sendBatch('/track', [payload]);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).requestContext).toBeDefined();
        expect((error as ApiError).requestContext?.url).toContain('/track');
        expect((error as ApiError).requestContext?.method).toBe('POST');
        expect((error as ApiError).requestContext?.payload).toEqual([payload]);
      }
    });

    it('should throw NetworkError on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network connection failed'));

      await expect(
        requester.sendBatch('/track', [createTrackEventPayload()])
      ).rejects.toThrow(NetworkError);

      try {
        await requester.sendBatch('/track', [createTrackEventPayload()]);
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).message).toBe(
          'Network connection failed'
        );
        expect((error as NetworkError).cause).toBeInstanceOf(Error);
      }
    });

    it('should throw NetworkError on AbortController timeout', async () => {
      mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

      await expect(
        requester.sendBatch('/track', [createTrackEventPayload()])
      ).rejects.toThrow(NetworkError);

      try {
        await requester.sendBatch('/track', [createTrackEventPayload()]);
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).cause).toBeInstanceOf(DOMException);
      }
    });

    it('should respect timeout configuration', async () => {
      const customRequester = createRequester({ requestTimeout: 10_000 });

      const mockSetTimeout = vi.fn(() => 12345);
      const mockClearTimeout = vi.fn();
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      global.setTimeout = mockSetTimeout as any;
      global.clearTimeout = mockClearTimeout as any;

      mockFetch.mockImplementation(() => new Promise(() => {}));

      customRequester.sendBatch('/track', [createTrackEventPayload()]);

      expect(mockSetTimeout).toHaveBeenCalledTimes(1);
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 10_000);

      const mockCalls = mockSetTimeout.mock.calls;
      const firstCall = mockCalls[0] as unknown as [() => void, number];
      const timeoutCallback = firstCall?.[0];

      const [, options] = mockFetch.mock.calls[0];
      const abortSignal = options.signal as AbortSignal;

      expect(abortSignal.aborted).toBe(false);

      if (timeoutCallback) {
        timeoutCallback();
      }

      expect(abortSignal.aborted).toBe(true);

      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    });

    it('should clear timeout when request completes successfully', async () => {
      const customRequester = createRequester({ requestTimeout: 10_000 });

      const mockSetTimeout = vi.fn(() => 12345);
      const mockClearTimeout = vi.fn();
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      global.setTimeout = mockSetTimeout as any;
      global.clearTimeout = mockClearTimeout as any;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await customRequester.sendBatch('/track', [createTrackEventPayload()]);

      expect(mockSetTimeout).toHaveBeenCalledTimes(1);
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 10_000);

      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockClearTimeout).toHaveBeenCalledWith(expect.any(Number));

      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    });

    it('should handle identify payloads with fetch', async () => {
      const identifyPayload = createIdentifyEventPayload();
      await requester.sendBatch('/identify', [
        identifyPayload as EventPayload,
      ]);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify([identifyPayload]));
    });
  });

  describe('retry with exponential backoff', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      setupBeaconUnavailable();
      mockFetch = global.fetch as any;
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('retries 5xx responses before succeeding', async () => {
      let attempts = 0;
      mockFetch.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers(),
            json: async () => ({}),
          });
        }
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK' });
      });

      const retryRequester = createRequester({
        maxHttpAttempts: 4,
        retryBaseDelayMs: 1_000,
      });

      const sendPromise = retryRequester.sendBatch('/track', [
        createTrackEventPayload(),
      ]);
      await vi.runAllTimersAsync();
      await sendPromise;

      expect(attempts).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries 429 responses before succeeding', async () => {
      let attempts = 0;
      mockFetch.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            headers: new Headers(),
            json: async () => ({}),
          });
        }
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK' });
      });

      const retryRequester = createRequester({
        maxHttpAttempts: 4,
        retryBaseDelayMs: 1_000,
      });

      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const sendPromise = retryRequester.sendBatch('/track', [
        createTrackEventPayload(),
      ]);
      await vi.runAllTimersAsync();
      await sendPromise;

      expect(attempts).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('rejects after max attempts on persistent 429', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers(),
        json: async () => ({}),
      });

      const retryRequester = createRequester({
        maxHttpAttempts: 2,
        retryBaseDelayMs: 100,
      });

      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const sendPromise = retryRequester.sendBatch('/track', [
        createTrackEventPayload(),
      ]);
      const rejectionAssertion = expect(sendPromise).rejects.toThrow(ApiError);
      await vi.runAllTimersAsync();
      await rejectionAssertion;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-retryable 4xx ApiError', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        json: async () => ({ error_code: 'bad' }),
      });

      const retryRequester = createRequester({
        maxHttpAttempts: 4,
        retryBaseDelayMs: 100,
      });

      await expect(
        retryRequester.sendBatch('/track', [createTrackEventPayload()])
      ).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
