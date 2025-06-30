import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import {
  Altertable,
  type AltertableConfig,
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
} from '../src/core';

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
  const fetchCall = (fetch as unknown as Mock).mock.calls[0];
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
      };
      altertable.init(apiKey, config);

      // Clear initial call (from init auto-capture)
      if (mode === 'beacon') {
        (navigator.sendBeacon as Mock).mockClear();
      } else {
        (fetch as unknown as Mock).mockClear();
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
        const fetchCall = (fetch as unknown as Mock).mock.calls[0];
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
        (fetch as unknown as Mock).mockClear();
      }
      window.dispatchEvent(new Event('popstate'));
      if (mode === 'beacon') {
        const callArgs = (navigator.sendBeacon as Mock).mock.calls[0];
        expect(callArgs[0]).toBe(
          `${config.baseUrl}/track?apiKey=${encodeURIComponent(apiKey)}`
        );
      } else {
        const fetchCall = (fetch as unknown as Mock).mock.calls[0];
        expect(fetchCall[0]).toBe(`${config.baseUrl}/track`);
      }
      vi.useRealTimers();
    });

    it('should not auto-capture when config.autoCapture is false', () => {
      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: false,
      };
      altertable.init(apiKey, config);
      if (mode === 'beacon') {
        expect(navigator.sendBeacon).not.toHaveBeenCalled();
      } else {
        expect(fetch).not.toHaveBeenCalled();
      }
    });

    it('warns when page() is called before initialization', () => {
      expect(() => {
        altertable.page('http://localhost/test');
      }).toWarnDev(
        '[Altertable] The client must be initialized with init() before configuring.'
      );
    });

    it('warns when track() is called before initialization', () => {
      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toWarnDev(
        '[Altertable] The client must be initialized with init() before tracking events.'
      );
    });

    describe('configure()', () => {
      it('warns when configure() is called before initialization', () => {
        expect(() => {
          altertable.configure({ debug: true });
        }).toWarnDev(
          '[Altertable] The client must be initialized with init() before configuring.'
        );
      });

      it('should update configuration when called after initialization', () => {
        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          debug: false,
        });

        altertable.configure({ debug: true, release: 'test-release' });

        // Verify the configuration was updated by checking debug behavior
        const logEventSpy = vi.spyOn(altertable['_logger'], 'logEvent');
        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith({
          event: 'test-event',
          user_id: `anonymous-${randomId}`,
          environment: 'production',
          properties: expect.objectContaining({
            [PROPERTY_RELEASE]: 'test-release',
            foo: 'bar',
          }),
        });
      });

      it('should enable auto-capture when configured after initialization', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };
        altertable.init(apiKey, config);

        // Clear any initial calls
        if (mode === 'beacon') {
          (navigator.sendBeacon as Mock).mockClear();
        } else {
          (fetch as unknown as Mock).mockClear();
        }

        altertable.configure({ autoCapture: true });

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
              [PROPERTY_REFERER]: null as string | null,
            },
          });
        }
      });

      it('should disable auto-capture when configured after initialization', () => {
        vi.useFakeTimers();
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: true,
        };
        altertable.init(apiKey, config);

        // Clear initial call(s) after init
        if (mode === 'beacon') {
          (navigator.sendBeacon as Mock).mockClear();
        } else {
          (fetch as unknown as Mock).mockClear();
        }

        altertable.configure({ autoCapture: false });

        // Advance time to trigger any pending intervals
        vi.advanceTimersByTime(AUTO_CAPTURE_INTERVAL * 2);

        // Should not send page event after cleanup
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        // Simulate popstate event - should not trigger page event
        window.dispatchEvent(new Event('popstate'));

        // Should still not send page event
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        vi.useRealTimers();
      });

      it('should not trigger auto-capture change when autoCapture value is the same', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: true,
        };
        altertable.init(apiKey, config);

        // Clear initial call
        if (mode === 'beacon') {
          (navigator.sendBeacon as Mock).mockClear();
        } else {
          (fetch as unknown as Mock).mockClear();
        }

        // Configure with same autoCapture value
        altertable.configure({ autoCapture: true });

        // Should not send another page event
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }
      });

      it('should update multiple configuration options at once', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          debug: false,
          environment: 'production',
        };
        altertable.init(apiKey, config);

        altertable.configure({
          debug: true,
          environment: 'staging',
          release: 'v1.0.0',
        });

        // Verify the configuration was updated by checking debug behavior and environment
        const logEventSpy = vi.spyOn(altertable['_logger'], 'logEvent');
        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith({
          event: 'test-event',
          user_id: `anonymous-${randomId}`,
          environment: 'staging',
          properties: expect.objectContaining({
            [PROPERTY_RELEASE]: 'v1.0.0',
            foo: 'bar',
          }),
        });
      });

      it('should properly cleanup auto-capture when disabled', () => {
        vi.useFakeTimers();
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: true,
        };
        altertable.init(apiKey, config);

        // Clear initial call
        if (mode === 'beacon') {
          (navigator.sendBeacon as Mock).mockClear();
        } else {
          (fetch as unknown as Mock).mockClear();
        }

        // Disable auto-capture
        altertable.configure({ autoCapture: false });

        // Advance time to trigger any pending intervals
        vi.advanceTimersByTime(AUTO_CAPTURE_INTERVAL * 2);

        // Should not send page event after cleanup
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        // Simulate popstate event - should not trigger page event
        window.dispatchEvent(new Event('popstate'));

        // Should still not send page event
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        vi.useRealTimers();
      });
    });
  });

  describe('with debug enabled', () => {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      groupCollapsed: console.groupCollapsed,
      groupEnd: console.groupEnd,
      table: console.table,
    };

    beforeEach(() => {
      // Mock console methods to avoid logging to the console during tests
      console.log = vi.fn();
      console.warn = vi.fn();
      console.error = vi.fn();
      console.groupCollapsed = vi.fn();
      console.groupEnd = vi.fn();
      console.table = vi.fn();
    });

    afterEach(() => {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.groupCollapsed = originalConsole.groupCollapsed;
      console.groupEnd = originalConsole.groupEnd;
      console.table = originalConsole.table;

      vi.clearAllMocks();
    });

    it('should call logHeader when debug is enabled on init', () => {
      const altertable = new Altertable();
      const logHeaderSpy = vi.spyOn(altertable['_logger'], 'logHeader');

      altertable.init('TEST_API_KEY', {
        debug: true,
        autoCapture: false,
      });

      expect(logHeaderSpy).toHaveBeenCalledTimes(1);
    });

    it('should not call logHeader when debug is disabled on init', () => {
      const altertable = new Altertable();
      const logHeaderSpy = vi.spyOn(altertable['_logger'], 'logHeader');

      altertable.init('TEST_API_KEY', {
        debug: false,
        autoCapture: false,
      });

      expect(logHeaderSpy).toHaveBeenCalledTimes(0);
    });

    it('should call logEvent when debug is enabled and track is called', () => {
      const altertable = new Altertable();
      const logEventSpy = vi.spyOn(altertable['_logger'], 'logEvent');

      altertable.init('TEST_API_KEY', {
        debug: true,
        autoCapture: false,
      });

      altertable.track('test-event', { foo: 'bar' });

      expect(logEventSpy).toHaveBeenCalledWith({
        event: 'test-event',
        user_id: expect.stringMatching(/anonymous-/),
        environment: 'production',
        properties: expect.objectContaining({
          foo: 'bar',
        }),
      });
    });

    it('should not call logEvent when debug is disabled and track is called', () => {
      const altertable = new Altertable();
      const logEventSpy = vi.spyOn(altertable['_logger'], 'logEvent');

      altertable.init('TEST_API_KEY', {
        debug: false,
        autoCapture: false,
      });

      altertable.track('test-event', { foo: 'bar' });

      expect(logEventSpy).toHaveBeenCalledTimes(0);
    });
  });
});
