import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { Altertable, AltertableConfig } from '../src/core';
import {
  AUTO_CAPTURE_INTERVAL,
  PAGEVIEW_EVENT,
  PROPERTY_LIB,
  PROPERTY_LIB_VERSION,
  PROPERTY_REFERER,
  PROPERTY_RELEASE,
  PROPERTY_SESSION_ID,
  PROPERTY_URL,
  PROPERTY_VIEWPORT,
  PROPERTY_VISITOR_ID,
  TrackingConsent,
} from '../src/lib/constants';

const setWindowLocation = (url: string) => {
  Object.defineProperty(window, 'location', {
    value: { href: url },
    writable: true,
    configurable: true,
  });
};

const expectBeaconCall = (config: AltertableConfig, apiKey: string) => {
  const callArgs = (navigator.sendBeacon as Mock).mock.calls[0];
  expect(callArgs[0]).toBe(
    `${config.baseUrl}/track?apiKey=${encodeURIComponent(apiKey)}`
  );
  expect(callArgs[1]).toBeInstanceOf(Blob);
};

const expectFetchCall = (
  config: AltertableConfig,
  apiKey: string,
  payload: Record<string, any>
) => {
  const fetchCall = (fetch as Mock).mock.calls[0];
  expect(fetchCall[0]).toBe(`${config.baseUrl}/track`);
  const options = fetchCall[1];
  expect(options.method).toBe('POST');
  expect(options.headers['Content-Type']).toBe('application/json');
  expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`);
  expect(options.body).toBe(JSON.stringify(payload));
};

const modes: {
  mode: 'beacon' | 'fetch';
  description: string;
  setup: () => void;
}[] = [
  {
    mode: 'beacon',
    description: 'with navigator.sendBeacon available',
    setup: () => {
      setWindowLocation('http://localhost/page');
      // Setup sendBeacon.
      global.navigator = { sendBeacon: vi.fn() } as any;
      // Remove fetch if present.
      global.fetch = undefined as any;
    },
  },
  {
    mode: 'fetch',
    description: 'with fetch fallback (navigator.sendBeacon not available)',
    setup: () => {
      setWindowLocation('http://localhost/page');
      // Remove sendBeacon if present.
      if ('sendBeacon' in navigator) {
        delete (navigator as any).sendBeacon;
      }
      // Setup fetch.
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        })
      ) as any;
    },
  },
];

// Run the same suite for each transport mode
modes.forEach(({ mode, description, setup }) => {
  describe(`Altertable ${description}`, () => {
    let altertable: Altertable;
    const apiKey = 'test-api-key';
    const viewPort = '1024x768';

    // Generate a fixed randomId and override crypto.randomUUID
    const randomId: string = crypto.randomUUID();
    crypto.randomUUID = vi.fn(() => randomId) as any;

    beforeEach(() => {
      setup();
      altertable = new Altertable();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('should send a page event on init with the current URL', () => {
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: true,
        trackingConsent: TrackingConsent.GRANTED,
      };
      altertable.init(apiKey, config);

      if (mode === 'beacon') {
        expect(navigator.sendBeacon).toHaveBeenCalled();
        expectBeaconCall(config, apiKey);
      } else {
        expect(fetch).toHaveBeenCalled();
        expectFetchCall(config, apiKey, {
          event: PAGEVIEW_EVENT,
          user_id: `anonymous-${randomId}`,
          environment: 'production',
          properties: {
            [PROPERTY_LIB]: 'TEST_LIB_NAME',
            [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
            [PROPERTY_URL]: 'http://localhost/page',
            [PROPERTY_SESSION_ID]: `session-${randomId}`,
            [PROPERTY_VISITOR_ID]: `visitor-${randomId}`,
            [PROPERTY_VIEWPORT]: viewPort,
            [PROPERTY_REFERER]: null,
          },
        });
      }
    });

    it('should send a track event with the default base URL', () => {
      const config: AltertableConfig = {
        autoCapture: false,
        trackingConsent: TrackingConsent.GRANTED,
      };
      altertable.init(apiKey, config);

      altertable.track('eventName', { foo: 'bar' });

      if (mode === 'beacon') {
        expect(navigator.sendBeacon).toHaveBeenCalledWith(
          'https://api.altertable.ai/track?apiKey=test-api-key',
          expect.anything()
        );
      } else {
        expect(fetch).toHaveBeenCalledWith(
          'https://api.altertable.ai/track',
          expect.anything()
        );
      }
    });

    it('should send a track event', () => {
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: TrackingConsent.GRANTED,
      };
      altertable.init(apiKey, config);

      altertable.track('eventName', { foo: 'bar' });

      if (mode === 'beacon') {
        expect(navigator.sendBeacon).toHaveBeenCalled();
        expectBeaconCall(config, apiKey);
      } else {
        expect(fetch).toHaveBeenCalled();
        expectFetchCall(config, apiKey, {
          event: 'eventName',
          user_id: `anonymous-${randomId}`,
          environment: 'production',
          properties: {
            [PROPERTY_LIB]: 'TEST_LIB_NAME',
            [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
            foo: 'bar',
          },
        });
      }
    });

    it('should send a track event with release ID', () => {
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: false,
        release: '04ed05b',
        trackingConsent: TrackingConsent.GRANTED,
      };
      altertable.init(apiKey, config);

      altertable.track('eventName', { foo: 'bar' });

      if (mode === 'beacon') {
        expect(navigator.sendBeacon).toHaveBeenCalled();
        expectBeaconCall(config, apiKey);
      } else {
        expect(fetch).toHaveBeenCalled();
        expectFetchCall(config, apiKey, {
          event: 'eventName',
          user_id: `anonymous-${randomId}`,
          environment: 'production',
          properties: {
            [PROPERTY_LIB]: 'TEST_LIB_NAME',
            [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
            [PROPERTY_RELEASE]: '04ed05b',
            foo: 'bar',
          },
        });
      }
    });

    it('should detect URL changes and send a page event', () => {
      vi.useFakeTimers();
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: true,
        trackingConsent: TrackingConsent.GRANTED,
      };
      altertable.init(apiKey, config);

      // Clear initial call (from init auto-capture)
      if (mode === 'beacon') {
        (navigator.sendBeacon as Mock).mockClear();
      } else {
        (fetch as Mock).mockClear();
      }

      // Simulate a URL change.
      setWindowLocation('http://localhost/new-page?foo=bar&baz=qux&test=to?');
      vi.advanceTimersByTime(AUTO_CAPTURE_INTERVAL + 1);

      if (mode === 'beacon') {
        const callArgs = (navigator.sendBeacon as Mock).mock.calls[0];
        expect(callArgs[0]).toBe(
          `${config.baseUrl}/track?apiKey=${encodeURIComponent(apiKey)}`
        );
      } else {
        const expectedPayload = {
          event: PAGEVIEW_EVENT,
          user_id: `anonymous-${randomId}`,
          environment: 'production',
          properties: {
            [PROPERTY_LIB]: 'TEST_LIB_NAME',
            [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
            [PROPERTY_URL]: 'http://localhost/new-page',
            [PROPERTY_SESSION_ID]: `session-${randomId}`,
            [PROPERTY_VISITOR_ID]: `visitor-${randomId}`,
            [PROPERTY_VIEWPORT]: viewPort,
            [PROPERTY_REFERER]: null,
            foo: 'bar',
            baz: 'qux',
            test: 'to?',
          },
        };
        const fetchCall = (fetch as Mock).mock.calls[0];
        expect(fetchCall[0]).toBe(`${config.baseUrl}/track`);
        const options = fetchCall[1];
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`);
        expect(options.body).toBe(JSON.stringify(expectedPayload));
      }

      // Also test that a manual event (popstate) triggers a check.
      if (mode === 'beacon') {
        (navigator.sendBeacon as Mock).mockClear();
      } else {
        (fetch as Mock).mockClear();
      }
      window.dispatchEvent(new Event('popstate'));
      if (mode === 'beacon') {
        const callArgs = (navigator.sendBeacon as Mock).mock.calls[0];
        expect(callArgs[0]).toBe(
          `${config.baseUrl}/track?apiKey=${encodeURIComponent(apiKey)}`
        );
      } else {
        const fetchCall = (fetch as Mock).mock.calls[0];
        expect(fetchCall[0]).toBe(`${config.baseUrl}/track`);
      }
      vi.useRealTimers();
    });

    it('should not auto-capture when config.autoCapture is false', () => {
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: TrackingConsent.GRANTED,
      };
      altertable.init(apiKey, config);
      if (mode === 'beacon') {
        expect(navigator.sendBeacon).not.toHaveBeenCalled();
      } else {
        expect(fetch).not.toHaveBeenCalled();
      }
    });

    it('should queue events when tracking consent is pending', () => {
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: TrackingConsent.PENDING,
      };
      altertable.init(apiKey, config);

      altertable.track('eventName', { foo: 'bar' });

      // Events should not be sent when consent is pending
      if (mode === 'beacon') {
        expect(navigator.sendBeacon).not.toHaveBeenCalled();
      } else {
        expect(fetch).not.toHaveBeenCalled();
      }
    });

    it('should not collect events when tracking consent is denied', () => {
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: TrackingConsent.DENIED,
      };
      altertable.init(apiKey, config);

      altertable.track('eventName', { foo: 'bar' });

      // Events should not be sent when consent is denied
      if (mode === 'beacon') {
        expect(navigator.sendBeacon).not.toHaveBeenCalled();
      } else {
        expect(fetch).not.toHaveBeenCalled();
      }
    });

    it('should flush queued events when consent changes from pending to granted', () => {
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: TrackingConsent.PENDING,
      };
      altertable.init(apiKey, config);

      // Queue some events
      altertable.track('event1', { foo: 'bar' });
      altertable.track('event2', { baz: 'qux' });

      // Events should not be sent yet
      if (mode === 'beacon') {
        expect(navigator.sendBeacon).not.toHaveBeenCalled();
      } else {
        expect(fetch).not.toHaveBeenCalled();
      }

      // Change consent to granted
      altertable.configure({ trackingConsent: TrackingConsent.GRANTED });

      // Both events should now be sent
      if (mode === 'beacon') {
        expect(navigator.sendBeacon).toHaveBeenCalledTimes(2);
      } else {
        expect(fetch).toHaveBeenCalledTimes(2);
      }
    });

    it('should clear queued events when consent changes to denied', () => {
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: TrackingConsent.PENDING,
      };
      altertable.init(apiKey, config);

      // Queue some events
      altertable.track('event1', { foo: 'bar' });
      altertable.track('event2', { baz: 'qux' });

      // Change consent to denied
      altertable.configure({ trackingConsent: TrackingConsent.DENIED });

      // Events should not be sent
      if (mode === 'beacon') {
        expect(navigator.sendBeacon).not.toHaveBeenCalled();
      } else {
        expect(fetch).not.toHaveBeenCalled();
      }

      // Send another event - should still not be sent
      altertable.track('event3', { test: 'value' });

      if (mode === 'beacon') {
        expect(navigator.sendBeacon).not.toHaveBeenCalled();
      } else {
        expect(fetch).not.toHaveBeenCalled();
      }
    });

    it('should return current tracking consent state', () => {
      const config: AltertableConfig = {
        trackingConsent: TrackingConsent.PENDING,
      };
      altertable.init(apiKey, config);

      expect(altertable.getTrackingConsent()).toBe(TrackingConsent.PENDING);

      altertable.configure({ trackingConsent: TrackingConsent.GRANTED });
      expect(altertable.getTrackingConsent()).toBe(TrackingConsent.GRANTED);

      altertable.configure({ trackingConsent: TrackingConsent.DENIED });
      expect(altertable.getTrackingConsent()).toBe(TrackingConsent.DENIED);
    });
  });
});
