import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { Requester, type RequesterConfig } from '../src/lib/requester';

describe('Requester', () => {
  let requester: Requester;
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
    it('should initialize with default timeout', () => {
      const config: RequesterConfig = {
        baseUrl: 'https://api.altertable.ai',
        apiKey: 'test-api-key',
      };
      const req = new Requester(config);
      expect(req.getConfig().requestTimeout).toBe(10000);
    });

    it('should initialize with custom timeout', () => {
      const config: RequesterConfig = {
        baseUrl: 'https://api.altertable.ai',
        apiKey: 'test-api-key',
        requestTimeout: 15000,
      };
      const req = new Requester(config);
      expect(req.getConfig().requestTimeout).toBe(15000);
    });
  });

  describe('send with sendBeacon available', () => {
    it('should use sendBeacon by default', async () => {
      const payload = { event: 'test', data: 'value' };

      await requester.send('/track', payload);

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();

      const [url, data] = mockSendBeacon.mock.calls[0];
      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(data).toBeInstanceOf(Blob);
      expect(data.type).toBe('application/json');
    });

    it('should include API key in URL', async () => {
      const payload = { event: 'test' };

      await requester.send('/identify', payload);

      const [url] = mockSendBeacon.mock.calls[0];
      expect(url).toBe(
        'https://api.altertable.ai/identify?apiKey=test-api-key'
      );
    });

    it('should fallback to fetch when sendBeacon returns false', async () => {
      mockSendBeacon.mockReturnValue(false);
      const payload = { event: 'test' };

      await requester.send('/track', payload);

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fallback to fetch when sendBeacon throws', async () => {
      mockSendBeacon.mockImplementation(() => {
        throw new Error('sendBeacon error');
      });
      const payload = { event: 'test' };

      await requester.send('/track', payload);

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('send with fetch fallback', () => {
    it('should use fetch when sendBeacon is not preferred', async () => {
      const payload = { event: 'test' };

      await requester.send('/track', payload, { preferBeacon: false });

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
      const payload = { event: 'test' };

      await requester.send('/track', payload);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSendBeacon).not.toHaveBeenCalled();
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const payload = { event: 'test' };

      await expect(
        requester.send('/track', payload, { preferBeacon: false })
      ).rejects.toThrow('Network error');
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      const payload = { event: 'test' };

      await expect(
        requester.send('/track', payload, { preferBeacon: false })
      ).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('should respect timeout configuration', async () => {
      const payload = { event: 'test' };

      await requester.send('/track', payload, { preferBeacon: false });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('should use keepalive by default', async () => {
      const payload = { event: 'test' };

      await requester.send('/track', payload, { preferBeacon: false });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.keepalive).toBe(true);
    });

    it('should respect keepalive option', async () => {
      const payload = { event: 'test' };

      await requester.send('/track', payload, {
        preferBeacon: false,
        keepalive: false,
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.keepalive).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should return current configuration', () => {
      const config = requester.getConfig();
      expect(config).toEqual(defaultConfig);
    });

    it('should update configuration', () => {
      requester.updateConfig({
        baseUrl: 'https://new-api.altertable.ai',
        requestTimeout: 15000,
      });

      const config = requester.getConfig();
      expect(config.baseUrl).toBe('https://new-api.altertable.ai');
      expect(config.requestTimeout).toBe(15000);
      expect(config.apiKey).toBe('test-api-key'); // unchanged
    });

    it('should use updated configuration for requests', async () => {
      requester.updateConfig({
        baseUrl: 'https://new-api.altertable.ai',
        apiKey: 'new-api-key',
      });

      const payload = { event: 'test' };
      await requester.send('/track', payload);

      const [url] = mockSendBeacon.mock.calls[0];
      expect(url).toBe(
        'https://new-api.altertable.ai/track?apiKey=new-api-key'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty payload', async () => {
      await requester.send('/track', {});

      const [, data] = mockSendBeacon.mock.calls[0];
      const text = await data.text();
      expect(JSON.parse(text)).toEqual({});
    });

    it('should handle complex payload', async () => {
      const payload = {
        event: 'test',
        properties: {
          nested: { value: 123 },
          array: [1, 2, 3],
        },
      };

      await requester.send('/track', payload);

      const [, data] = mockSendBeacon.mock.calls[0];
      const text = await data.text();
      expect(JSON.parse(text)).toEqual(payload);
    });

    it('should handle special characters in API key', async () => {
      const config: RequesterConfig = {
        baseUrl: 'https://api.altertable.ai',
        apiKey: 'test-api-key@#$%',
        requestTimeout: 5000,
      };
      const req = new Requester(config);

      const payload = { event: 'test' };
      await req.send('/track', payload);

      const [url] = mockSendBeacon.mock.calls[0];
      expect(url).toBe(
        'https://api.altertable.ai/track?apiKey=test-api-key%40%23%24%25'
      );
    });
  });
});
