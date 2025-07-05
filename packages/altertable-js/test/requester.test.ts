import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { Requester, type RequesterConfig } from '../src/lib/requester';
import { EventPayload, IdentifyPayload, TrackPayload } from '../src/types';

function createTrackEventPayload(
  partialPayload: Partial<TrackPayload> = {}
): TrackPayload {
  return {
    event: 'Event Tracked',
    timestamp: new Date().toISOString(),
    properties: {},
    environment: 'test',
    user_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
    visitor_id: 'visitor-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    session_id: 'session-0197d9df-4e77-72cb-bf0a-e35b3f1f5425',
    ...partialPayload,
  };
}

function createIdentifyEventPayload(
  partialPayload: Partial<IdentifyPayload> = {}
): IdentifyPayload {
  return {
    traits: { email: 'test@example.com' },
    environment: 'test',
    user_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
    visitor_id: 'visitor-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    ...partialPayload,
  };
}

describe('Requester', () => {
  let requester: Requester<EventPayload>;
  let mockFetch: Mock;
  let mockSendBeacon: Mock;
  let originalFetch: typeof fetch;
  let originalNavigator: Navigator;
  let originalWindow: Window;
  let originalBlob: typeof Blob;

  const defaultConfig: RequesterConfig = {
    baseUrl: 'https://api.altertable.ai',
    apiKey: 'test-api-key',
    requestTimeout: 5000,
  };

  function forceFetchInTest() {
    delete (global.navigator as any).sendBeacon;
  }

  beforeEach(() => {
    // Store original globals
    originalFetch = global.fetch;
    originalNavigator = global.navigator;
    originalWindow = global.window;
    originalBlob = global.Blob;

    // Mock fetch with proper typing
    mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
      })
    ) as Mock;
    (mockFetch as any).preconnect = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    // Mock sendBeacon
    mockSendBeacon = vi.fn(() => true);
    global.navigator = {
      sendBeacon: mockSendBeacon,
    } as unknown as Navigator;

    // Mock window
    // @ts-expect-error
    global.window = {} as unknown as typeof globalThis;

    // Mock Blob to support text() method for testing
    global.Blob = class MockBlob extends originalBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        // Add text method for testing
        (this as any).text = async () => {
          if (parts[0] instanceof ArrayBuffer) {
            return new TextDecoder().decode(parts[0] as ArrayBuffer);
          }
          return parts[0] as string;
        };
      }
    } as typeof Blob;

    requester = new Requester(defaultConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    global.navigator = originalNavigator;
    // @ts-expect-error
    global.window = originalWindow;
    global.Blob = originalBlob;
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      const config: RequesterConfig = {
        baseUrl: 'https://custom.api.com',
        apiKey: 'custom-api-key',
        requestTimeout: 15000,
      };
      const customRequester = new Requester(config);

      expect(customRequester['_config'].baseUrl).toBe('https://custom.api.com');
      expect(customRequester['_config'].apiKey).toBe('custom-api-key');
      expect(customRequester['_config'].requestTimeout).toBe(15000);
    });
  });

  describe('URL construction', () => {
    it('should properly encode API key in URL', async () => {
      const configWithSpecialChars: RequesterConfig = {
        ...defaultConfig,
        apiKey: 'test-api-key with spaces & special chars',
      };
      const customRequester = new Requester(configWithSpecialChars);

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
      const blobText = await data.text();
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
      const blobText = await data.text();
      const parsedData = JSON.parse(blobText);

      expect(parsedData).toEqual(identifyPayload);
    });
  });

  describe('fetch fallback behavior', () => {
    it('should use fetch when sendBeacon is not available', async () => {
      forceFetchInTest();

      await requester.send('/track', createTrackEventPayload());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSendBeacon).toHaveBeenCalledTimes(0);
    });

    it('should configure fetch with correct options', async () => {
      forceFetchInTest();

      await requester.send('/track', createTrackEventPayload());

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.keepalive).toBe(true);
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('should serialize payload as JSON string in fetch', async () => {
      forceFetchInTest();

      const payload = createTrackEventPayload();
      await requester.send('/track', payload);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify(payload));
    });

    it('should handle fetch network errors', async () => {
      forceFetchInTest();

      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        requester.send('/track', createTrackEventPayload())
      ).rejects.toThrow('Network error');
    });

    it('should handle HTTP error responses', async () => {
      forceFetchInTest();

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
      forceFetchInTest();

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
      forceFetchInTest();

      const configWithTimeout: RequesterConfig = {
        ...defaultConfig,
        requestTimeout: 10000,
      };
      const customRequester = new Requester(configWithTimeout);

      // Mock setTimeout and clearTimeout to track calls
      const mockSetTimeout = vi.fn(() => 12345); // Return a timer ID
      const mockClearTimeout = vi.fn();
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      global.setTimeout = mockSetTimeout as unknown as typeof setTimeout;
      global.clearTimeout = mockClearTimeout as unknown as typeof clearTimeout;

      // Mock fetch to never resolve (simulate slow request)
      mockFetch.mockImplementation(() => new Promise(() => {}));

      // Start the request (it will hang due to the mock)
      customRequester.send('/track', createTrackEventPayload());

      // Verify setTimeout was called with the correct timeout
      expect(mockSetTimeout).toHaveBeenCalledTimes(1);
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 10000);

      // Get the timeout callback and abort function
      const mockCalls = mockSetTimeout.mock.calls;
      const timeoutCallback =
        mockCalls.length > 0 && typeof mockCalls[0][0] === 'function'
          ? (mockCalls[0][0] as () => void)
          : undefined;

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

      // Clean up
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    });

    it('should clear timeout when request completes successfully', async () => {
      forceFetchInTest();

      const configWithTimeout: RequesterConfig = {
        ...defaultConfig,
        requestTimeout: 10000,
      };
      const customRequester = new Requester(configWithTimeout);

      // Mock setTimeout and clearTimeout to track calls
      const mockSetTimeout = vi.fn(() => 12345); // Return a timer ID
      const mockClearTimeout = vi.fn();
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      global.setTimeout = mockSetTimeout as unknown as typeof setTimeout;
      global.clearTimeout = mockClearTimeout as unknown as typeof clearTimeout;

      // Mock fetch to resolve immediately
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      // Make the request
      await customRequester.send('/track', createTrackEventPayload());

      // Verify setTimeout was called
      expect(mockSetTimeout).toHaveBeenCalledTimes(1);
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 10000);

      // Verify clearTimeout was called (timeout was cleared)
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockClearTimeout).toHaveBeenCalledWith(expect.any(Number));

      // Clean up
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    });

    it('should handle identify payloads with fetch', async () => {
      forceFetchInTest();

      const identifyPayload = createIdentifyEventPayload();
      await requester.send('/identify', identifyPayload);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify(identifyPayload));
    });
  });
});
