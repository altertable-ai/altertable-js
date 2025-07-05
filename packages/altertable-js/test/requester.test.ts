import '../../../test-utils/matchers/toRequestApi';
import '../../../test-utils/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  setupBeaconAvailable,
  setupBeaconUnavailable,
} from '../../../test-utils/networkMode';
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
    user_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
    visitor_id: 'visitor-0197d9df-3c3b-734e-96dd-dfda52b0167c',
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
    user_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
    visitor_id: 'visitor-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    ...overrides,
  };
}

function createRequester(overrides: Partial<RequesterConfig> = {}) {
  const defaultConfig: RequesterConfig = {
    baseUrl: 'https://api.altertable.ai',
    apiKey: 'test-api-key',
    requestTimeout: 5_000,
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

      await customRequester.send('/track', createTrackEventPayload());

      const [url] = mockSendBeacon.mock.calls[0];
      expect(url).toBe(
        'https://api.altertable.ai/track?apiKey=test-api-key%20with%20spaces%20%26%20special%20chars'
      );
    });

    it('should construct correct URLs for different endpoints', async () => {
      await requester.send('/identify', createIdentifyEventPayload());
      await requester.send('/track', createTrackEventPayload());

      const identifyUrl = mockSendBeacon.mock.calls[0][0];
      const trackUrl = mockSendBeacon.mock.calls[1][0];

      expect(identifyUrl).toBe(
        'https://api.altertable.ai/identify?apiKey=test-api-key'
      );
      expect(trackUrl).toBe(
        'https://api.altertable.ai/track?apiKey=test-api-key'
      );
    });
  });

  describe('sendBeacon behavior', () => {
    it('should use sendBeacon by default when available', async () => {
      await requester.send('/track', createTrackEventPayload());

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(0);

      const [url, data] = mockSendBeacon.mock.calls[0];
      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(data).toBeInstanceOf(Blob);
      expect(data.type).toBe('application/json');
    });

    it('should serialize payload as JSON blob', async () => {
      const payload = createTrackEventPayload();

      await requester.send('/track', payload);

      const [, data] = mockSendBeacon.mock.calls[0];
      const blobText = (data as any).content;
      const parsedData = JSON.parse(blobText);

      expect(parsedData).toEqual(payload);
    });

    it('should fallback to fetch when sendBeacon returns false', async () => {
      mockSendBeacon.mockReturnValue(false);

      await requester.send('/track', createTrackEventPayload());

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fallback to fetch when sendBeacon throws', async () => {
      mockSendBeacon.mockImplementation(() => {
        throw new Error('sendBeacon error');
      });

      await requester.send('/track', createTrackEventPayload());

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle identify payloads with sendBeacon', async () => {
      const identifyPayload = createIdentifyEventPayload();

      await requester.send('/identify', identifyPayload);

      const [, data] = mockSendBeacon.mock.calls[0];
      const blobText = (data as any).content;
      const parsedData = JSON.parse(blobText);

      expect(parsedData).toEqual(identifyPayload);
    });
  });

  describe('fetch fallback behavior', () => {
    beforeEach(() => {
      setupBeaconUnavailable();
      mockFetch = global.fetch as any;
    });

    it('should use fetch when sendBeacon is not available', async () => {
      await requester.send('/track', createTrackEventPayload());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSendBeacon).toHaveBeenCalledTimes(0);
    });

    it('should configure fetch with correct options', async () => {
      await requester.send('/track', createTrackEventPayload());

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.keepalive).toBe(true);
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('should serialize payload as JSON string in fetch', async () => {
      const payload = createTrackEventPayload();

      await requester.send('/track', payload);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify(payload));
    });

    it('should handle fetch network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        requester.send('/track', createTrackEventPayload())
      ).rejects.toThrow('Network error');
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        requester.send('/track', createTrackEventPayload())
      ).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('should handle different HTTP error status codes', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(
        requester.send('/track', createTrackEventPayload())
      ).rejects.toThrow('HTTP 429: Too Many Requests');
    });

    it('should respect timeout configuration', async () => {
      const customRequester = createRequester({ requestTimeout: 10_000 });

      // Mock setTimeout and clearTimeout to track calls
      const mockSetTimeout = vi.fn(() => 12345);
      const mockClearTimeout = vi.fn();
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      global.setTimeout = mockSetTimeout as any;
      global.clearTimeout = mockClearTimeout as any;

      // Mock fetch to never resolve (simulate slow request)
      mockFetch.mockImplementation(() => new Promise(() => {}));

      // Start the request (it will hang due to the mock)
      customRequester.send('/track', createTrackEventPayload());

      // Verify setTimeout was called with the correct timeout
      expect(mockSetTimeout).toHaveBeenCalledTimes(1);
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 10_000);

      // Get the timeout callback and abort function
      const mockCalls = mockSetTimeout.mock.calls;
      const firstCall = mockCalls[0] as unknown as [() => void, number];
      const timeoutCallback = firstCall?.[0];

      const [, options] = mockFetch.mock.calls[0];
      const abortSignal = options.signal as AbortSignal;

      // Verify the signal is not aborted initially
      expect(abortSignal.aborted).toBe(false);

      // Trigger the timeout
      if (timeoutCallback) {
        timeoutCallback();
      }

      // Verify the signal is now aborted
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

      // Mock fetch to resolve immediately
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await customRequester.send('/track', createTrackEventPayload());

      expect(mockSetTimeout).toHaveBeenCalledTimes(1);
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 10_000);

      // Verify clearTimeout was called (timeout was cleared)
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockClearTimeout).toHaveBeenCalledWith(expect.any(Number));

      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    });

    it('should handle identify payloads with fetch', async () => {
      const identifyPayload = createIdentifyEventPayload();
      await requester.send('/identify', identifyPayload);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify(identifyPayload));
    });
  });
});
