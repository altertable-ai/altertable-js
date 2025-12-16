import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onAlias, onIdentify, onPage, onScreen, onTrack } from '../src/index';
import {
  type FunctionSettings,
  type SegmentAliasEvent,
  type SegmentIdentifyEvent,
  type SegmentPageEvent,
  type SegmentScreenEvent,
  type SegmentTrackEvent,
} from '../src/types';

describe('Altertable Segment Destination', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    (global as any).fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultSettings: FunctionSettings = {
    apiKey: 'test-api-key',
  };

  describe('onTrack', () => {
    it('should send track event to Altertable API', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Button Clicked',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        anonymousId: 'anon-456',
        properties: {
          buttonId: 'signup-button',
          page: '/landing',
        },
        context: {
          ip: '192.168.1.1',
          page: {
            url: 'https://example.com/landing',
            path: '/landing',
            referrer: 'https://google.com',
            title: 'Landing Page',
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onTrack(event, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.event).toBe('Button Clicked');
      expect(body.properties.buttonId).toBe('signup-button');
      expect(body.properties.$ip).toBe('192.168.1.1');
      expect(body.properties.$url).toBe('https://example.com/landing');
      expect(body.properties.$referer).toBe('https://google.com');
      expect(body.distinct_id).toBe('user-123');
      expect(body.anonymous_id).toBe('anon-456');
    });

    it('should use anonymousId as distinct_id when userId is not present', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Page View',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        anonymousId: 'anon-456',
        properties: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onTrack(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.distinct_id).toBe('anon-456');
      expect(body.anonymous_id).toBeUndefined();
    });

    it('should map campaign data to UTM parameters', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Campaign Click',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        properties: {},
        context: {
          campaign: {
            name: 'summer-sale',
            source: 'google',
            medium: 'cpc',
            term: 'shoes',
            content: 'ad-variant-a',
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onTrack(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.properties.utm_campaign).toBe('summer-sale');
      expect(body.properties.utm_source).toBe('google');
      expect(body.properties.utm_medium).toBe('cpc');
      expect(body.properties.utm_term).toBe('shoes');
      expect(body.properties.utm_content).toBe('ad-variant-a');
    });

    it('should map device context to Altertable properties', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'App Open',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        properties: {},
        context: {
          device: {
            type: 'mobile',
            id: 'device-abc',
            model: 'iPhone 14',
          },
          screen: {
            width: 390,
            height: 844,
          },
          os: {
            name: 'iOS',
          },
          userAgent: 'Mozilla/5.0...',
          locale: 'en-US',
          timezone: 'America/New_York',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onTrack(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.properties.$device).toBe('mobile');
      expect(body.properties.$device_model).toBe('iPhone 14');
      expect(body.properties.$viewport).toBe('390x844');
      expect(body.properties.$os).toBe('iOS');
      expect(body.properties.$user_agent).toBe('Mozilla/5.0...');
      expect(body.device_id).toBe('device-abc');
    });

    it('should add library information from context', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Test Event',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        properties: {},
        context: {
          library: {
            name: 'analytics.js',
            version: '4.1.0',
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onTrack(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.properties.$lib).toBe('analytics.js');
      expect(body.properties.$lib_version).toBe('4.1.0');
    });

    it('should use custom endpoint when provided', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Custom Event',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        properties: {},
      };

      const customSettings: FunctionSettings = {
        apiKey: 'test-api-key',
        endpoint: 'https://custom.altertable.ai',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onTrack(event, customSettings);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        'https://custom.altertable.ai/track?apiKey=test-api-key'
      );
    });

    it('should throw RetryError on network failure', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Test Event',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        properties: {},
      };

      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(onTrack(event, defaultSettings)).rejects.toThrow(RetryError);
      await expect(onTrack(event, defaultSettings)).rejects.toThrow(
        'Network error'
      );
    });

    it('should throw RetryError on 5xx server errors', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Test Event',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        properties: {},
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(onTrack(event, defaultSettings)).rejects.toThrow(RetryError);
      await expect(onTrack(event, defaultSettings)).rejects.toThrow(
        'Failed with 500: Internal Server Error'
      );
    });

    it('should throw RetryError on 4xx rate limit errors', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Test Event',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        properties: {},
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate Limit Exceeded',
      });

      await expect(onTrack(event, defaultSettings)).rejects.toThrow(RetryError);
      await expect(onTrack(event, defaultSettings)).rejects.toThrow(
        'Failed with 429: Rate Limit Exceeded'
      );
    });
  });

  describe('onIdentify', () => {
    it('should send identify event to Altertable API', async () => {
      const event: SegmentIdentifyEvent = {
        type: 'identify',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        anonymousId: 'anon-456',
        traits: {
          email: 'user@example.com',
          name: 'John Doe',
          plan: 'premium',
        },
        context: {
          ip: '192.168.1.1',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onIdentify(event, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe(
        'https://api.altertable.ai/identify?apiKey=test-api-key'
      );
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.traits.email).toBe('user@example.com');
      expect(body.traits.name).toBe('John Doe');
      expect(body.traits.plan).toBe('premium');
      expect(body.traits.$ip).toBe('192.168.1.1');
      expect(body.distinct_id).toBe('user-123');
      expect(body.anonymous_id).toBe('anon-456');
    });

    it('should include context properties in traits', async () => {
      const event: SegmentIdentifyEvent = {
        type: 'identify',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        traits: {
          email: 'user@example.com',
        },
        context: {
          device: {
            type: 'mobile',
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onIdentify(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.traits.$device).toBe('mobile');
    });
  });

  describe('onAlias', () => {
    it('should send alias event to Altertable API', async () => {
      const event: SegmentAliasEvent = {
        type: 'alias',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        previousId: 'anon-456',
        context: {
          device: {
            id: 'device-abc',
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onAlias(event, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://api.altertable.ai/alias?apiKey=test-api-key');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.new_user_id).toBe('user-123');
      expect(body.distinct_id).toBe('anon-456');
      expect(body.device_id).toBe('device-abc');
    });
  });

  describe('onPage', () => {
    it('should convert page event to $pageview track event', async () => {
      const event: SegmentPageEvent = {
        type: 'page',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        name: 'Home',
        category: 'Marketing',
        properties: {
          url: 'https://example.com',
          title: 'Homepage',
        },
        context: {
          page: {
            url: 'https://example.com',
            path: '/',
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onPage(event, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');

      const body = JSON.parse(options.body);
      expect(body.event).toBe('$pageview');
      expect(body.properties.$page_name).toBe('Home');
      expect(body.properties.$page_category).toBe('Marketing');
      expect(body.properties.url).toBe('https://example.com');
      expect(body.properties.title).toBe('Homepage');
      expect(body.properties.$url).toBe('https://example.com');
    });

    it('should handle page event without name and category', async () => {
      const event: SegmentPageEvent = {
        type: 'page',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        properties: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onPage(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.event).toBe('$pageview');
      expect(body.properties.$page_name).toBeUndefined();
      expect(body.properties.$page_category).toBeUndefined();
    });
  });

  describe('onScreen', () => {
    it('should convert screen event to $screen track event', async () => {
      const event: SegmentScreenEvent = {
        type: 'screen',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        name: 'Dashboard',
        category: 'App',
        properties: {
          screenId: 'dashboard-main',
        },
        context: {
          device: {
            type: 'mobile',
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onScreen(event, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');

      const body = JSON.parse(options.body);
      expect(body.event).toBe('$screen');
      expect(body.properties.$screen_name).toBe('Dashboard');
      expect(body.properties.$screen_category).toBe('App');
      expect(body.properties.screenId).toBe('dashboard-main');
      expect(body.properties.$device).toBe('mobile');
    });

    it('should handle screen event without name and category', async () => {
      const event: SegmentScreenEvent = {
        type: 'screen',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        properties: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onScreen(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.event).toBe('$screen');
      expect(body.properties.$screen_name).toBeUndefined();
      expect(body.properties.$screen_category).toBeUndefined();
    });
  });

  describe('Error Classes', () => {
    it('should create RetryError with correct properties', () => {
      const error = new RetryError('Test retry error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RetryError);
      expect(error.name).toBe('RetryError');
      expect(error.message).toBe('Test retry error');
    });

    it('should create EventNotSupported with correct properties', () => {
      const error = new EventNotSupported('Test not supported');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EventNotSupported);
      expect(error.name).toBe('EventNotSupported');
      expect(error.message).toBe('Test not supported');
    });
  });
});
