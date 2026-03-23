import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Global error classes from setup.ts
declare const RetryError: {
  new (message: string): Error;
};
declare const EventNotSupported: {
  new (message: string): Error;
};

import {
  onAlias,
  onBatch,
  onIdentify,
  onPage,
  onScreen,
  onTrack,
} from '../src/index';
import {
  type FunctionSettings,
  type SegmentAliasEvent,
  type SegmentAnyEvent,
  type SegmentDeleteEvent,
  type SegmentGroupEvent,
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
            foo: 'bar',
          } as NonNullable<SegmentTrackEvent['context']>['campaign'], // force usage of `foo`
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onTrack(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.properties.$utm_campaign).toBe('summer-sale');
      expect(body.properties.$utm_source).toBe('google');
      expect(body.properties.$utm_medium).toBe('cpc');
      expect(body.properties.$utm_term).toBe('shoes');
      expect(body.properties.$utm_content).toBe('ad-variant-a');
      expect(body.properties.utm_foo).toBe('bar');
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

    it('should set $ip to 0 when channel is "server" and no IP in context', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Server Event',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        channel: 'server',
        properties: {},
        context: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onTrack(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.properties.$ip).toBe(0);
    });

    it('should keep $ip from context when channel is "server" but IP is already set', async () => {
      const event: SegmentTrackEvent = {
        type: 'track',
        event: 'Server Event',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        channel: 'server',
        properties: {},
        context: {
          ip: '192.168.1.1',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onTrack(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.properties.$ip).toBe('192.168.1.1');
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
          userAgent: 'a user agent',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onIdentify(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.traits.$user_agent).toBe('a user agent');
    });

    it('should use anonymousId as distinct_id when userId is not present', async () => {
      const event: SegmentIdentifyEvent = {
        type: 'identify',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        anonymousId: 'anon-456',
        traits: {
          email: 'user@example.com',
          name: 'John Doe',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onIdentify(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.distinct_id).toBe('anon-456');
      expect(body.anonymous_id).toBeUndefined();
      expect(body.traits.email).toBe('user@example.com');
      expect(body.traits.name).toBe('John Doe');
    });

    it('should use userId as distinct_id when anonymousId is not present', async () => {
      const event: SegmentIdentifyEvent = {
        type: 'identify',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        traits: {
          email: 'user@example.com',
          name: 'John Doe',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onIdentify(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.distinct_id).toBe('user-123');
      expect(body.anonymous_id).toBeUndefined();
      expect(body.traits.email).toBe('user@example.com');
      expect(body.traits.name).toBe('John Doe');
    });

    it('should set $ip to 0 in traits when channel is "server" and no IP in context', async () => {
      const event: SegmentIdentifyEvent = {
        type: 'identify',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        channel: 'server',
        traits: {
          email: 'user@example.com',
        },
        context: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onIdentify(event, defaultSettings);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.traits.$ip).toBe(0);
    });

    it('should keep $ip from context in traits when channel is "server" but IP is already set', async () => {
      const event: SegmentIdentifyEvent = {
        type: 'identify',
        messageId: 'msg-123',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 'user-123',
        channel: 'server',
        traits: {
          email: 'user@example.com',
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

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.traits.$ip).toBe('192.168.1.1');
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
      expect(body.properties.url).toBe('https://example.com');
      expect(body.properties.title).toBe('Homepage');
      expect(body.properties.$url).toBe('https://example.com');
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
          userAgent: 'a user agent',
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
      expect(body.properties.screenId).toBe('dashboard-main');
      expect(body.properties.$user_agent).toBe('a user agent');
    });
  });

  describe('onBatch', () => {
    it('should batch multiple track events together', async () => {
      const events: SegmentTrackEvent[] = [
        {
          type: 'track',
          event: 'Button Clicked',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
          properties: { buttonId: 'btn-1' },
        },
        {
          type: 'track',
          event: 'Page Viewed',
          messageId: 'msg-2',
          timestamp: '2025-01-15T10:01:00.000Z',
          userId: 'user-123',
          properties: { page: '/home' },
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onBatch(events, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].event).toBe('Button Clicked');
      expect(body[0].properties.buttonId).toBe('btn-1');
      expect(body[1].event).toBe('Page Viewed');
      expect(body[1].properties.page).toBe('/home');
    });

    it('should batch multiple identify events together', async () => {
      const events: SegmentIdentifyEvent[] = [
        {
          type: 'identify',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
          traits: { email: 'user@example.com' },
        },
        {
          type: 'identify',
          messageId: 'msg-2',
          timestamp: '2025-01-15T10:01:00.000Z',
          userId: 'user-456',
          traits: { name: 'Jane Doe' },
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onBatch(events, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe(
        'https://api.altertable.ai/identify?apiKey=test-api-key'
      );
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].traits.email).toBe('user@example.com');
      expect(body[0].distinct_id).toBe('user-123');
      expect(body[1].traits.name).toBe('Jane Doe');
      expect(body[1].distinct_id).toBe('user-456');
    });

    it('should batch multiple alias events together', async () => {
      const events: SegmentAliasEvent[] = [
        {
          type: 'alias',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
          previousId: 'anon-456',
        },
        {
          type: 'alias',
          messageId: 'msg-2',
          timestamp: '2025-01-15T10:01:00.000Z',
          userId: 'user-789',
          previousId: 'anon-012',
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onBatch(events, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://api.altertable.ai/alias?apiKey=test-api-key');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].new_user_id).toBe('user-123');
      expect(body[0].distinct_id).toBe('anon-456');
      expect(body[1].new_user_id).toBe('user-789');
      expect(body[1].distinct_id).toBe('anon-012');
    });

    it('should batch multiple page events together as track events', async () => {
      const events: SegmentPageEvent[] = [
        {
          type: 'page',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
          name: 'Home',
          properties: { url: 'https://example.com' },
        },
        {
          type: 'page',
          messageId: 'msg-2',
          timestamp: '2025-01-15T10:01:00.000Z',
          userId: 'user-123',
          name: 'About',
          properties: { url: 'https://example.com/about' },
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onBatch(events, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');

      const body = JSON.parse(options.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].event).toBe('$pageview');
      expect(body[0].properties.url).toBe('https://example.com');
      expect(body[1].event).toBe('$pageview');
      expect(body[1].properties.url).toBe('https://example.com/about');
    });

    it('should batch multiple screen events together as track events', async () => {
      const events: SegmentScreenEvent[] = [
        {
          type: 'screen',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
          name: 'Dashboard',
          properties: { screenId: 'dashboard-main' },
        },
        {
          type: 'screen',
          messageId: 'msg-2',
          timestamp: '2025-01-15T10:01:00.000Z',
          userId: 'user-123',
          name: 'Settings',
          properties: { screenId: 'settings-main' },
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onBatch(events, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://api.altertable.ai/track?apiKey=test-api-key');

      const body = JSON.parse(options.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].event).toBe('$screen');
      expect(body[0].properties.screenId).toBe('dashboard-main');
      expect(body[1].event).toBe('$screen');
      expect(body[1].properties.screenId).toBe('settings-main');
    });

    it('should batch mixed event types separately by type', async () => {
      const events: SegmentAnyEvent[] = [
        {
          type: 'track',
          event: 'Button Clicked',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
          properties: {},
        },
        {
          type: 'identify',
          messageId: 'msg-2',
          timestamp: '2025-01-15T10:01:00.000Z',
          userId: 'user-123',
          traits: { email: 'user@example.com' },
        },
        {
          type: 'track',
          event: 'Page Viewed',
          messageId: 'msg-3',
          timestamp: '2025-01-15T10:02:00.000Z',
          userId: 'user-123',
          properties: {},
        },
        {
          type: 'page',
          messageId: 'msg-4',
          timestamp: '2025-01-15T10:03:00.000Z',
          userId: 'user-123',
          properties: {},
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onBatch(events, defaultSettings);

      // Should have 2 calls: track (2 track events + 1 page event converted), identify (1 event)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: track events (msg-1, msg-3) and page event converted to track (msg-4)
      const [url1, options1] = mockFetch.mock.calls[0];
      expect(url1).toBe('https://api.altertable.ai/track?apiKey=test-api-key');
      const body1 = JSON.parse(options1.body);
      expect(Array.isArray(body1)).toBe(true);
      expect(body1).toHaveLength(3);
      expect(body1[0].event).toBe('Button Clicked');
      expect(body1[1].event).toBe('Page Viewed');
      expect(body1[2].event).toBe('$pageview');

      // Second call: identify event (msg-2)
      const [url2, options2] = mockFetch.mock.calls[1];
      expect(url2).toBe(
        'https://api.altertable.ai/identify?apiKey=test-api-key'
      );
      const body2 = JSON.parse(options2.body);
      expect(Array.isArray(body2)).toBe(true);
      expect(body2).toHaveLength(1);
      expect(body2[0].traits.email).toBe('user@example.com');
    });

    it('should throw EventNotSupported for group events', async () => {
      const events: SegmentGroupEvent[] = [
        {
          type: 'group',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
          groupId: 'group-456',
          traits: {},
        },
      ];

      await expect(onBatch(events, defaultSettings)).rejects.toThrow(
        EventNotSupported
      );
      await expect(onBatch(events, defaultSettings)).rejects.toThrow(
        'group is not supported'
      );
    });

    it('should throw EventNotSupported for delete events', async () => {
      const events: SegmentDeleteEvent[] = [
        {
          type: 'delete',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
        },
      ];

      await expect(onBatch(events, defaultSettings)).rejects.toThrow(
        EventNotSupported
      );
      await expect(onBatch(events, defaultSettings)).rejects.toThrow(
        'delete is not supported'
      );
    });

    it('should throw EventNotSupported for unknown event types', async () => {
      const events = [
        {
          type: 'unknown',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
        },
      ] as unknown as SegmentAnyEvent[];

      await expect(onBatch(events, defaultSettings)).rejects.toThrow(
        EventNotSupported
      );
      await expect(onBatch(events, defaultSettings)).rejects.toThrow(
        'event type unknown is not supported'
      );
    });

    it('should handle empty batch', async () => {
      const events: SegmentAnyEvent[] = [];

      await onBatch(events, defaultSettings);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle batch with single event', async () => {
      const events: SegmentTrackEvent[] = [
        {
          type: 'track',
          event: 'Single Event',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
          properties: {},
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await onBatch(events, defaultSettings);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].event).toBe('Single Event');
    });

    it('should propagate errors from individual batch handlers', async () => {
      const events: SegmentTrackEvent[] = [
        {
          type: 'track',
          event: 'Test Event',
          messageId: 'msg-1',
          timestamp: '2025-01-15T10:00:00.000Z',
          userId: 'user-123',
          properties: {},
        },
      ];

      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(onBatch(events, defaultSettings)).rejects.toThrow(
        RetryError
      );
      await expect(onBatch(events, defaultSettings)).rejects.toThrow(
        'Network error'
      );
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
