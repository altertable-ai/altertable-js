import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { Requester, type RequesterConfig } from '../src/lib/requester';
import { EventPayload, TrackPayload } from '../src/types';

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

describe('Requester', () => {
  let requester: Requester<EventPayload>;
  let mockFetch: Mock;
  let mockSendBeacon: Mock;

  const defaultConfig: RequesterConfig = {
    baseUrl: 'https://api.altertable.ai',
    apiKey: 'test-api-key',
    requestTimeout: 5000,
  };

  beforeEach(() => {
    // Mock fetch
    mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
      })
    );
    global.fetch = mockFetch;

    // Mock sendBeacon
    mockSendBeacon = vi.fn(() => true);
    global.navigator = {
      sendBeacon: mockSendBeacon,
    } as any;

    // Mock window
    global.window = {} as any;

    requester = new Requester(defaultConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with timeout', () => {
      const config: RequesterConfig = {
        baseUrl: 'https://api.altertable.ai',
        apiKey: 'test-api-key',
        requestTimeout: 15000,
      };
      const requester = new Requester(config);
      expect(requester['_config'].requestTimeout).toBe(15000);
    });
  });

  describe('send with sendBeacon available', () => {
    it('should use sendBeacon by default', async () => {
      await requester.send('/track', createTrackEventPayload());

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(0);

      const [url, data] = mockSendBeacon.mock.calls[0];
      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(data).toBeInstanceOf(Blob);
      expect(data.type).toBe('application/json');
    });

    it('should include API key in URL', async () => {
      await requester.send('/identify', createTrackEventPayload());

      const [url] = mockSendBeacon.mock.calls[0];
      expect(url).toBe(
        'https://api.altertable.ai/identify?apiKey=test-api-key'
      );
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
  });

  describe('send with fetch fallback', () => {
    it('should use fetch when sendBeacon is not preferred', async () => {
      await requester.send('/track', createTrackEventPayload());

      await requester.send('/track', createTrackEventPayload());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSendBeacon).not.toHaveBeenCalled();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.keepalive).toBe(true);
    });

    it('should use fetch when sendBeacon is not available', async () => {
      // Remove sendBeacon
      delete (global.navigator as any).sendBeacon;

      await requester.send('/track', createTrackEventPayload());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSendBeacon).not.toHaveBeenCalled();
    });

    it('should handle fetch errors', async () => {
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

    it('should respect timeout configuration', async () => {
      await requester.send('/track', createTrackEventPayload());

      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('should use keepalive', async () => {
      await requester.send('/track', createTrackEventPayload());

      const [, options] = mockFetch.mock.calls[0];
      expect(options.keepalive).toBe(true);
    });
  });
});
