import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import {
  AUTO_CAPTURE_INTERVAL_MS,
  EVENT_PAGEVIEW,
  PREFIX_SESSION_ID,
  PREFIX_VISITOR_ID,
  PROPERTY_LIB,
  PROPERTY_LIB_VERSION,
  PROPERTY_REFERER,
  PROPERTY_RELEASE,
  PROPERTY_URL,
  PROPERTY_VIEWPORT,
} from '../src/constants';
import { Altertable, type AltertableConfig } from '../src/core';
import * as storageModule from '../src/lib/storage';
import { StorageApi } from '../src/lib/storage';
import { UserId, UserTraits } from '../src/types';

const REGEXP_DATE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REGEXP_SESSION_ID = new RegExp(`^${PREFIX_SESSION_ID}-`);
const REGEXP_VISITOR_ID = new RegExp(`^${PREFIX_VISITOR_ID}-`);

function createStorageMock(
  storageMock: Partial<{
    [key in keyof StorageApi]: Mock<() => StorageApi[key]>;
  }> = {}
) {
  return {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    migrate: vi.fn(),
    ...storageMock,
  };
}

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
  expect(JSON.parse(options.body)).toEqual(payload);
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

    // Generate different random IDs for each call to simulate real behavior
    let idCounter = 0;
    const originalRandomUUID = crypto.randomUUID;
    crypto.randomUUID = vi.fn(() => {
      idCounter++;
      // Generate a deterministic but unique ID for each call
      return `test-uuid-${idCounter}-${Date.now()}`;
    }) as any;

    beforeEach(() => {
      setup();
      if (altertable?.['_isInitialized']) {
        altertable.reset({ resetVisitorId: true, resetSessionId: true });
      }
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
        trackingConsent: 'granted',
      };
      altertable.init(apiKey, config);

      if (mode === 'beacon') {
        expect(navigator.sendBeacon).toHaveBeenCalled();
        expectBeaconCall(config, apiKey);
      } else {
        expect(fetch).toHaveBeenCalled();
        expectFetchCall(config, apiKey, {
          timestamp: expect.stringMatching(REGEXP_DATE_ISO),
          event: EVENT_PAGEVIEW,
          user_id: null,
          session_id: expect.stringMatching(REGEXP_SESSION_ID),
          visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
          environment: 'production',
          properties: {
            [PROPERTY_LIB]: 'TEST_LIB_NAME',
            [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
            [PROPERTY_URL]: 'http://localhost/page',
            [PROPERTY_VIEWPORT]: viewPort,
            [PROPERTY_REFERER]: null,
          },
        });
      }
    });

    it('should send a track event with the default base URL', () => {
      const config: AltertableConfig = {
        autoCapture: false,
        trackingConsent: 'granted',
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
        trackingConsent: 'granted',
      };
      altertable.init(apiKey, config);

      altertable.track('eventName', { foo: 'bar' });

      if (mode === 'beacon') {
        expect(navigator.sendBeacon).toHaveBeenCalled();
        expectBeaconCall(config, apiKey);
      } else {
        expect(fetch).toHaveBeenCalled();
        expectFetchCall(config, apiKey, {
          timestamp: expect.stringMatching(REGEXP_DATE_ISO),
          event: 'eventName',
          user_id: null,
          session_id: expect.stringMatching(REGEXP_SESSION_ID),
          visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
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
        trackingConsent: 'granted',
      };
      altertable.init(apiKey, config);

      altertable.track('eventName', { foo: 'bar' });

      if (mode === 'beacon') {
        expect(navigator.sendBeacon).toHaveBeenCalled();
        expectBeaconCall(config, apiKey);
      } else {
        expect(fetch).toHaveBeenCalled();
        expectFetchCall(config, apiKey, {
          timestamp: expect.stringMatching(REGEXP_DATE_ISO),
          event: 'eventName',
          user_id: null,
          session_id: expect.stringMatching(REGEXP_SESSION_ID),
          visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
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
        trackingConsent: 'granted',
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
      vi.advanceTimersByTime(AUTO_CAPTURE_INTERVAL_MS + 1);

      if (mode === 'beacon') {
        const callArgs = (navigator.sendBeacon as Mock).mock.calls[0];
        expect(callArgs[0]).toBe(
          `${config.baseUrl}/track?apiKey=${encodeURIComponent(apiKey)}`
        );
      } else {
        const fetchCall = (fetch as unknown as Mock).mock.calls[0];
        expect(fetchCall[0]).toBe(`${config.baseUrl}/track`);
        const options = fetchCall[1];
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`);
        expect(JSON.parse(options.body)).toEqual({
          timestamp: expect.stringMatching(REGEXP_DATE_ISO),
          event: EVENT_PAGEVIEW,
          user_id: null,
          session_id: expect.stringMatching(REGEXP_SESSION_ID),
          visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
          environment: 'production',
          properties: {
            [PROPERTY_LIB]: 'TEST_LIB_NAME',
            [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
            [PROPERTY_URL]: 'http://localhost/new-page',
            [PROPERTY_VIEWPORT]: viewPort,
            [PROPERTY_REFERER]: null as string | null,
            foo: 'bar',
            baz: 'qux',
            test: 'to?',
          },
        });
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
        trackingConsent: 'granted',
      };
      altertable.init(apiKey, config);
      if (mode === 'beacon') {
        expect(navigator.sendBeacon).not.toHaveBeenCalled();
      } else {
        expect(fetch).not.toHaveBeenCalled();
      }
    });

    it('should set viewport to null when window is not available', () => {
      // Remove window from global scope to simulate server-side environment
      const originalWindow = global.window;
      delete (global as any).window;

      // No storage is available since we delete window, so we suppress the memory
      // fallback storage warning
      vi.spyOn(altertable['_logger'], 'warn').mockImplementation(() => {});

      const config: AltertableConfig = {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: 'granted',
      };
      altertable.init(apiKey, config);

      altertable.page('http://localhost/test-page');

      if (mode === 'beacon') {
        expect(navigator.sendBeacon).toHaveBeenCalled();
        expectBeaconCall(config, apiKey);
      } else {
        expect(fetch).toHaveBeenCalled();
        expectFetchCall(config, apiKey, {
          timestamp: expect.stringMatching(REGEXP_DATE_ISO),
          event: EVENT_PAGEVIEW,
          user_id: null,
          session_id: expect.stringMatching(REGEXP_SESSION_ID),
          visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
          environment: 'production',
          properties: {
            [PROPERTY_LIB]: 'TEST_LIB_NAME',
            [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
            [PROPERTY_URL]: 'http://localhost/test-page',
            [PROPERTY_VIEWPORT]: null,
            [PROPERTY_REFERER]: null,
          },
        });
      }

      // Restore window
      global.window = originalWindow;
    });

    it('throws when page() is called before initialization', () => {
      expect(() => {
        altertable.page('http://localhost/test');
      }).toThrow(
        '[Altertable] The client must be initialized with init() before tracking page views.'
      );
    });

    it('throws when track() is called before initialization', () => {
      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toThrow(
        '[Altertable] The client must be initialized with init() before tracking events.'
      );
    });

    it('throws when init() is called with empty API key', () => {
      expect(() => {
        altertable.init('', { baseUrl: 'http://localhost' });
      }).toThrow('[Altertable] Missing API key');
    });

    it('throws when init() is called with null API key', () => {
      expect(() => {
        altertable.init(null as any, { baseUrl: 'http://localhost' });
      }).toThrow('[Altertable] Missing API key');
    });

    it('throws when init() is called with undefined API key', () => {
      expect(() => {
        altertable.init(undefined as any, { baseUrl: 'http://localhost' });
      }).toThrow('[Altertable] Missing API key');
    });

    describe('configure()', () => {
      function clearNetworkCalls() {
        if (mode === 'beacon') {
          (navigator.sendBeacon as Mock).mockClear();
        } else {
          (fetch as unknown as Mock).mockClear();
        }
      }

      it('throws when configure() is called before initialization', () => {
        expect(() => {
          altertable.configure({ debug: true });
        }).toThrow(
          '[Altertable] The client must be initialized with init() before configuring.'
        );
      });

      it('should update configuration when called after initialization', () => {
        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          debug: false,
          trackingConsent: 'granted',
        });

        clearNetworkCalls();

        altertable.configure({ debug: true, release: 'test-release' });

        // Verify the configuration was updated by checking debug behavior
        const logEventSpy = vi
          .spyOn(altertable['_logger'], 'logEvent')
          .mockImplementation(() => {});
        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith(
          {
            timestamp: expect.stringMatching(REGEXP_DATE_ISO),
            event: 'test-event',
            user_id: null,
            session_id: expect.stringMatching(REGEXP_SESSION_ID),
            visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
            environment: 'production',
            properties: expect.objectContaining({
              [PROPERTY_RELEASE]: 'test-release',
              foo: 'bar',
            }),
          },
          { trackingConsent: 'granted' }
        );
      });

      it('should update multiple configuration options at once', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          debug: false,
          environment: 'production',
          trackingConsent: 'granted',
        };
        altertable.init(apiKey, config);

        altertable.configure({
          debug: true,
          environment: 'staging',
          release: 'v1.0.0',
        });

        // Verify the configuration was updated by checking debug behavior and environment
        const logEventSpy = vi
          .spyOn(altertable['_logger'], 'logEvent')
          .mockImplementation(() => {});
        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith(
          {
            timestamp: expect.stringMatching(REGEXP_DATE_ISO),
            event: 'test-event',
            user_id: null,
            session_id: expect.stringMatching(REGEXP_SESSION_ID),
            visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
            environment: 'staging',
            properties: expect.objectContaining({
              [PROPERTY_RELEASE]: 'v1.0.0',
              foo: 'bar',
            }),
          },
          { trackingConsent: 'granted' }
        );
      });

      it('should call logHeader when debug is enabled on init', () => {
        const logHeaderSpy = vi
          .spyOn(altertable['_logger'], 'logHeader')
          .mockImplementation(() => {});

        altertable.init('TEST_API_KEY', {
          debug: true,
          autoCapture: false,
          trackingConsent: 'granted',
        });

        expect(logHeaderSpy).toHaveBeenCalledTimes(1);
      });

      it('should not call logHeader when debug is disabled on init', () => {
        const logHeaderSpy = vi
          .spyOn(altertable['_logger'], 'logHeader')
          .mockImplementation(() => {});

        altertable.init('TEST_API_KEY', {
          debug: false,
          autoCapture: false,
          trackingConsent: 'granted',
        });

        expect(logHeaderSpy).toHaveBeenCalledTimes(0);
      });

      it('should call logEvent when debug is enabled and track is called', () => {
        vi.spyOn(altertable['_logger'], 'logHeader').mockImplementation(
          () => {}
        );
        const logEventSpy = vi
          .spyOn(altertable['_logger'], 'logEvent')
          .mockImplementation(() => {});

        altertable.init('TEST_API_KEY', {
          debug: true,
          autoCapture: false,
          trackingConsent: 'granted',
        });

        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith(
          {
            timestamp: expect.stringMatching(REGEXP_DATE_ISO),
            event: 'test-event',
            user_id: null,
            session_id: expect.stringMatching(REGEXP_SESSION_ID),
            visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
            environment: 'production',
            properties: expect.objectContaining({
              foo: 'bar',
            }),
          },
          { trackingConsent: 'granted' }
        );
      });

      it('should not call logEvent when debug is disabled and track is called', () => {
        const logEventSpy = vi
          .spyOn(altertable['_logger'], 'logEvent')
          .mockImplementation(() => {});

        altertable.init('TEST_API_KEY', {
          debug: false,
          autoCapture: false,
        });

        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledTimes(0);
      });
    });

    describe('persistence configuration', () => {
      it('should use localStorage+cookie as default persistence strategy', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };

        const selectStorageSpy = vi
          .spyOn(storageModule, 'selectStorage')
          .mockReturnValue(createStorageMock());

        altertable.init(apiKey, config);

        expect(selectStorageSpy).toHaveBeenCalledWith('localStorage+cookie', {
          onFallback: expect.any(Function),
        });
      });

      it('should use custom persistence strategy when provided', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          persistence: 'memory',
        };

        const selectStorageSpy = vi
          .spyOn(storageModule, 'selectStorage')
          .mockReturnValue(createStorageMock());

        altertable.init(apiKey, config);

        expect(selectStorageSpy).toHaveBeenCalledWith('memory', {
          onFallback: expect.any(Function),
        });
      });

      it('should warn when storage fallback occurs', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          persistence: 'localStorage',
        };

        const warnSpy = vi
          .spyOn(altertable['_logger'], 'warn')
          .mockImplementation(() => {});

        // Mock selectStorage to trigger a fallback
        vi.spyOn(storageModule, 'selectStorage').mockImplementation(
          (type, { onFallback }) => {
            onFallback('localStorage not supported, falling back to memory.');
            return createStorageMock();
          }
        );

        altertable.init(apiKey, config);

        expect(warnSpy).toHaveBeenCalledWith(
          'localStorage not supported, falling back to memory.'
        );
      });
    });

    describe('user identification', () => {
      it('should identify user with valid user ID and empty traits', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };
        altertable.init(apiKey, config);

        const userId: UserId = 'user123';

        altertable.identify(userId);

        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalledWith(
            'http://localhost/identify?apiKey=test-api-key',
            expect.anything()
          );
        } else {
          const fetchCall = (fetch as unknown as Mock).mock.calls[0];
          expect(fetchCall[0]).toBe('http://localhost/identify');
          const options = fetchCall[1];
          expect(options.method).toBe('POST');
          expect(options.headers['Content-Type']).toBe('application/json');
          expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`);

          const body = JSON.parse(options.body);
          expect(body).toEqual({
            environment: 'production',
            traits: {},
            user_id: userId,
            visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
          });
        }
      });

      it('should identify user with valid user ID and traits', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };
        altertable.init(apiKey, config);

        const userId: UserId = 'user123';
        const traits: UserTraits = { email: 'user@example.com' };

        altertable.identify(userId, traits);

        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalledWith(
            'http://localhost/identify?apiKey=test-api-key',
            expect.anything()
          );
        } else {
          const fetchCall = (fetch as unknown as Mock).mock.calls[0];
          expect(fetchCall[0]).toBe('http://localhost/identify');
          const options = fetchCall[1];
          expect(options.method).toBe('POST');
          expect(options.headers['Content-Type']).toBe('application/json');
          expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`);

          const body = JSON.parse(options.body);
          expect(body).toEqual({
            environment: 'production',
            traits,
            user_id: userId,
            visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
          });
        }
      });

      it('should throw error for reserved user ID', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };
        altertable.init(apiKey, config);

        expect(() => {
          altertable.identify('anonymous_id', {});
        }).toThrow(
          '[Altertable] User ID "anonymous_id" is a reserved identifier and cannot be used.'
        );
      });

      it('should throw error for empty user ID', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };
        altertable.init(apiKey, config);

        expect(() => {
          altertable.identify('', {});
        }).toThrow(
          '[Altertable] User ID cannot be empty or contain only whitespace.'
        );
      });

      it('should throw when identify called before init', () => {
        expect(() => {
          altertable.identify('user123', {});
        }).toThrow(
          '[Altertable] The client must be initialized with init() before identifying users.'
        );
      });

      it('should update traits for identified user', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };
        altertable.init(apiKey, config);

        altertable.identify('user123', { email: 'user@example.com' });

        if (mode === 'beacon') {
          (navigator.sendBeacon as Mock).mockClear();
        } else {
          (fetch as unknown as Mock).mockClear();
        }

        const newTraits = { name: 'John Doe', plan: 'premium' };
        altertable.updateTraits(newTraits);

        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalledWith(
            'http://localhost/identify?apiKey=test-api-key',
            expect.anything()
          );
        } else {
          const fetchCall = (fetch as unknown as Mock).mock.calls[0];
          expect(fetchCall[0]).toBe('http://localhost/identify');
          const options = fetchCall[1];
          expect(options.method).toBe('POST');
          expect(options.headers['Content-Type']).toBe('application/json');
          expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`);

          const body = JSON.parse(options.body);
          expect(body).toEqual({
            environment: 'production',
            traits: newTraits,
            user_id: 'user123',
            visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
          });
        }
      });

      it('should throw when updateTraits called without identifying user', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };
        altertable.init(apiKey, config);

        expect(() => {
          altertable.updateTraits({ email: 'user@example.com' });
        }).toThrow(
          '[Altertable] User must be identified with identify() before updating traits.'
        );
      });
    });

    describe('session management', () => {
      it('should generate new session ID on initialization', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };
        altertable.init(apiKey, config);

        const sessionId = altertable['_sessionManager'].getSessionId();
        expect(sessionId).toMatch(REGEXP_SESSION_ID);
      });

      it('should persist session ID across page reloads', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };

        const testVisitorId = 'visitor-test-uuid-1-1234567890';
        const testSessionId = 'session-test-uuid-2-1234567890';
        const existingSessionData = JSON.stringify({
          visitorId: testVisitorId,
          sessionId: testSessionId,
          userId: null,
          lastEventAt: null,
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue({
          getItem: vi.fn().mockReturnValue(existingSessionData),
          setItem: vi.fn(),
          removeItem: vi.fn(),
          migrate: vi.fn(),
        });

        altertable.init(apiKey, config);

        const sessionId = altertable['_sessionManager'].getSessionId();
        expect(sessionId).toBe(testSessionId);
      });

      it('should regenerate session ID when event is sent after 30 minutes since last event', () => {
        vi.useFakeTimers();
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };

        const testVisitorId = 'visitor-test-uuid-3-1234567890';
        const testSessionId = 'session-test-uuid-4-1234567890';
        const thirtyMinutesAgo = new Date(
          Date.now() - 30 * 60 * 1000 - 1000
        ).toISOString(); // 30 minutes + 1 second ago
        const existingSessionData = JSON.stringify({
          visitorId: testVisitorId,
          sessionId: testSessionId,
          userId: null,
          lastEventAt: thirtyMinutesAgo,
          trackingConsent: 'granted',
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue({
          getItem: vi.fn().mockReturnValue(existingSessionData),
          setItem: vi.fn(),
          removeItem: vi.fn(),
          migrate: vi.fn(),
        });

        altertable.init(apiKey, config);

        const initialSessionId = altertable['_sessionManager'].getSessionId();
        expect(initialSessionId).toBe(testSessionId);

        if (mode === 'beacon') {
          (navigator.sendBeacon as Mock).mockClear();
        } else {
          (fetch as unknown as Mock).mockClear();
        }

        // Send an event - this should trigger session renewal
        altertable.track('test-event', { foo: 'bar' });

        // Verify that a new session ID was generated
        const newSessionId = altertable['_sessionManager'].getSessionId();
        expect(newSessionId).not.toBe(testSessionId);
        expect(newSessionId).toMatch(REGEXP_SESSION_ID);

        // Verify that the event was sent with the new session ID
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalled();
          expectBeaconCall(config, apiKey);
        } else {
          expect(fetch).toHaveBeenCalled();
          expectFetchCall(config, apiKey, {
            timestamp: expect.stringMatching(REGEXP_DATE_ISO),
            event: 'test-event',
            user_id: null,
            session_id: newSessionId,
            visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
            environment: 'production',
            properties: {
              [PROPERTY_LIB]: 'TEST_LIB_NAME',
              [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
              foo: 'bar',
            },
          });
        }

        vi.useRealTimers();
      });

      it('should not regenerate session ID when event is sent within 30 minutes of last event', () => {
        vi.useFakeTimers();
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
        };

        const testVisitorId = 'visitor-test-uuid-5-1234567890';
        const testSessionId = 'session-test-uuid-6-1234567890';
        const twentyNineMinutesAgo = new Date(
          Date.now() - 29 * 60 * 1000
        ).toISOString(); // 29 minutes ago (within 30 min window)
        const existingSessionData = JSON.stringify({
          visitorId: testVisitorId,
          sessionId: testSessionId,
          userId: null,
          lastEventAt: twentyNineMinutesAgo,
          trackingConsent: 'granted',
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue({
          getItem: vi.fn().mockReturnValue(existingSessionData),
          setItem: vi.fn(),
          removeItem: vi.fn(),
          migrate: vi.fn(),
        });

        altertable.init(apiKey, config);

        const initialSessionId = altertable['_sessionManager'].getSessionId();
        expect(initialSessionId).toBe(testSessionId);

        if (mode === 'beacon') {
          (navigator.sendBeacon as Mock).mockClear();
        } else {
          (fetch as unknown as Mock).mockClear();
        }

        // Send an event - this should NOT trigger session renewal
        altertable.track('test-event', { foo: 'bar' });

        // Verify that the session ID remains the same
        const currentSessionId = altertable['_sessionManager'].getSessionId();
        expect(currentSessionId).toBe(testSessionId);

        // Verify that the event was sent with the same session ID
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalled();
          expectBeaconCall(config, apiKey);
        } else {
          expect(fetch).toHaveBeenCalled();
          expectFetchCall(config, apiKey, {
            timestamp: expect.stringMatching(REGEXP_DATE_ISO),
            event: 'test-event',
            user_id: null,
            session_id: testSessionId,
            visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
            environment: 'production',
            properties: {
              [PROPERTY_LIB]: 'TEST_LIB_NAME',
              [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
              foo: 'bar',
            },
          });
        }

        vi.useRealTimers();
      });

      it('should reset user ID when reset called', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };
        altertable.init(apiKey, config);

        altertable.identify('user123', {});
        const originalUserId = altertable['_sessionManager'].getUserId();
        expect(originalUserId).toBe('user123');

        altertable.reset();
        const userId = altertable['_sessionManager'].getUserId();
        expect(userId).toBeNull();
      });

      it('should reset session ID when reset called with default parameters', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };

        altertable.init(apiKey, config);
        altertable.identify('user123', { email: 'user@example.com' });

        const originalSessionId = altertable['_sessionManager'].getSessionId();
        const originalUserId = altertable['_sessionManager'].getUserId();
        const originalVisitorId = altertable['_sessionManager'].getVisitorId();

        expect(originalUserId).toBe('user123');

        altertable.reset();

        const newSessionId = altertable['_sessionManager'].getSessionId();
        expect(newSessionId).not.toEqual(originalSessionId);
        expect(newSessionId).toMatch(REGEXP_SESSION_ID);

        const newUserId = altertable['_sessionManager'].getUserId();
        expect(newUserId).toBeNull();
        expect(newUserId).not.toEqual(originalUserId);

        // Visitor ID should remain the same (not reset by default)
        const newVisitorId = altertable['_sessionManager'].getVisitorId();
        expect(newVisitorId).toEqual(originalVisitorId);
      });

      it('should reset visitor ID when reset called with resetVisitorId', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };

        altertable.init(apiKey, config);
        altertable.identify('user123', { email: 'user@example.com' });

        const originalUserId = altertable['_sessionManager'].getUserId();
        const originalVisitorId = altertable['_sessionManager'].getVisitorId();

        expect(originalUserId).toBe('user123');

        altertable.reset({ resetVisitorId: true });

        const newVisitorId = altertable['_sessionManager'].getVisitorId();
        expect(newVisitorId).not.toEqual(originalVisitorId);
        expect(newVisitorId).toMatch(REGEXP_VISITOR_ID);
      });

      it('should not reset session ID when reset called with resetSessionId: false', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };

        altertable.init(apiKey, config);
        altertable.identify('user123', { email: 'user@example.com' });

        const originalUserId = altertable['_sessionManager'].getUserId();
        const originalSessionId = altertable['_sessionManager'].getSessionId();

        expect(originalUserId).toBe('user123');

        altertable.reset({ resetSessionId: false });

        const newSessionId = altertable['_sessionManager'].getSessionId();
        expect(newSessionId).toEqual(originalSessionId);
      });

      it('should throw when reset called before initialization', () => {
        expect(() => {
          altertable.reset();
        }).toThrow(
          '[Altertable] The client must be initialized with init() before resetting.'
        );
      });
    });

    describe('storage system', () => {
      it('should save user data to storage when identify called', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };

        const storageMock = createStorageMock();

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        altertable.init(apiKey, config);
        altertable.identify('user123', { email: 'user@example.com' });

        expect(storageMock.setItem).toHaveBeenCalledWith(
          'atbl.test-api-key.production',
          expect.stringContaining('"userId":"user123"')
        );

        const lastCall =
          storageMock.setItem.mock.calls[
            storageMock.setItem.mock.calls.length - 1
          ];
        const storedData = JSON.parse(lastCall[1]);
        expect(storedData).toMatchObject({
          visitorId: expect.stringMatching(REGEXP_VISITOR_ID),
          sessionId: expect.stringMatching(REGEXP_SESSION_ID),
          userId: 'user123',
          lastEventAt: null,
        });
      });

      it('should recover storage data on initialization', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };

        const testVisitorId = 'visitor-test-uuid-3-1234567890';
        const testSessionId = 'session-test-uuid-4-1234567890';
        const existingData = JSON.stringify({
          visitorId: testVisitorId,
          sessionId: testSessionId,
          userId: 'user123',
          lastEventAt: '2023-01-01T00:00:00.000Z',
          trackingConsent: 'granted',
        });

        const storageMock = createStorageMock({
          getItem: vi.fn().mockReturnValue(existingData),
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        altertable.init(apiKey, config);

        const visitorId = altertable['_sessionManager'].getVisitorId();
        const sessionId = altertable['_sessionManager'].getSessionId();
        const userId = altertable['_sessionManager'].getUserId();
        const lastEventAt = altertable['_sessionManager'].getLastEventAt();
        expect(visitorId).toBe(testVisitorId);
        expect(sessionId).toBe(testSessionId);
        expect(userId).toBe('user123');
        expect(lastEventAt).toBe('2023-01-01T00:00:00.000Z');
      });

      it('should handle corrupted storage data gracefully', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };

        const storageMock = createStorageMock({
          getItem: vi.fn().mockReturnValue('invalid-json'),
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        expect(() => {
          altertable.init(apiKey, config);
        }).toWarnDev(
          '[Altertable] Failed to parse storage data. Resetting session data.'
        );

        const userId = altertable['_sessionManager'].getUserId();
        const sessionId = altertable['_sessionManager'].getSessionId();
        const visitorId = altertable['_sessionManager'].getVisitorId();
        expect(userId).toBeNull();
        expect(sessionId).toMatch(REGEXP_SESSION_ID);
        expect(visitorId).toMatch(REGEXP_VISITOR_ID);
      });

      it('should construct storage key with default environment when not specified', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };

        const storageMock = createStorageMock();

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        altertable.init(apiKey, config);

        expect(storageMock.setItem).toHaveBeenCalledWith(
          'atbl.test-api-key.production',
          expect.anything()
        );
      });

      it('should construct storage key with development environment', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          environment: 'development',
          trackingConsent: 'granted',
        };

        const storageMock = createStorageMock();

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        altertable.init(apiKey, config);

        expect(storageMock.setItem).toHaveBeenCalledWith(
          'atbl.test-api-key.development',
          expect.anything()
        );
      });
    });

    describe('tracking consent', () => {
      function clearNetworkCalls() {
        if (mode === 'beacon') {
          (navigator.sendBeacon as Mock).mockClear();
        } else {
          (fetch as unknown as Mock).mockClear();
        }
      }

      // Mock storage for tracking consent tests
      const createStorageMock = () => ({
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        migrate: vi.fn(),
      });

      beforeEach(() => {
        // Mock storage for each test to ensure clean state
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );
      });

      it('should send events immediately when consent is granted', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };
        altertable.init(apiKey, config);

        altertable.track('test-event', { foo: 'bar' });

        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalled();
        } else {
          expect(fetch).toHaveBeenCalled();
        }
      });

      it('should queue events when consent is pending', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'pending',
        };
        altertable.init(apiKey, config);

        altertable.track('test-event-1', { foo: 'bar' });
        altertable.track('test-event-2', { baz: 'qux' });

        // No network calls should be made
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        // Events should be queued
        expect(altertable['_eventQueue'].getSize()).toBe(2);
      });

      it('should queue events when consent is dismissed', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'dismissed',
        };
        altertable.init(apiKey, config);

        altertable.track('test-event', { foo: 'bar' });

        // No network calls should be made
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        // Event should be queued
        expect(altertable['_eventQueue'].getSize()).toBe(1);
      });

      it('should not collect or send events when consent is denied', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'denied',
        };
        altertable.init(apiKey, config);

        altertable.track('test-event', { foo: 'bar' });

        // No network calls should be made
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        // Event should not be queued
        expect(altertable['_eventQueue'].getSize()).toBe(0);
      });

      it('should flush queued events when consent changes from pending to granted', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'pending',
        };
        altertable.init(apiKey, config);

        // Queue some events
        altertable.track('test-event-1', { foo: 'bar' });
        altertable.track('test-event-2', { baz: 'qux' });

        expect(altertable['_eventQueue'].getSize()).toBe(2);

        // Clear network calls
        clearNetworkCalls();

        // Change consent to granted
        altertable.configure({ trackingConsent: 'granted' });

        // Queued events should be sent
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalledTimes(2);
        } else {
          expect(fetch).toHaveBeenCalledTimes(2);
        }

        // Queue should be empty
        expect(altertable['_eventQueue'].getSize()).toBe(0);
      });

      it('should flush queued events when consent changes from dismissed to granted', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'dismissed',
        };
        altertable.init(apiKey, config);

        // Queue some events
        altertable.track('test-event-1', { foo: 'bar' });
        altertable.track('test-event-2', { baz: 'qux' });

        expect(altertable['_eventQueue'].getSize()).toBe(2);

        // Clear network calls
        clearNetworkCalls();

        // Change consent to granted
        altertable.configure({ trackingConsent: 'granted' });

        // Queued events should be sent
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalledTimes(2);
        } else {
          expect(fetch).toHaveBeenCalledTimes(2);
        }

        // Queue should be empty
        expect(altertable['_eventQueue'].getSize()).toBe(0);
      });

      it('should clear queued events when consent changes to denied', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'pending',
        };
        altertable.init(apiKey, config);

        // Queue some events
        altertable.track('test-event-1', { foo: 'bar' });
        altertable.track('test-event-2', { baz: 'qux' });

        expect(altertable['_eventQueue'].getSize()).toBe(2);

        // Change consent to denied
        altertable.configure({ trackingConsent: 'denied' });

        // Queue should be cleared
        expect(altertable['_eventQueue'].getSize()).toBe(0);
      });

      it('should not flush events when consent changes from granted to pending', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        };
        altertable.init(apiKey, config);

        // Send an event
        altertable.track('test-event-1', { foo: 'bar' });

        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
        } else {
          expect(fetch).toHaveBeenCalledTimes(1);
        }

        // Clear network calls
        clearNetworkCalls();

        // Change consent to pending
        altertable.configure({ trackingConsent: 'pending' });

        altertable.track('test-event-2', { foo: 'bar' });

        // No additional network calls should be made
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }
      });

      it('should get current tracking consent state', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'pending',
        };
        altertable.init(apiKey, config);

        expect(altertable.getTrackingConsent()).toBe('pending');

        altertable.configure({ trackingConsent: 'granted' });
        expect(altertable.getTrackingConsent()).toBe('granted');
      });

      it('should handle page events with different consent states', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'pending',
        };
        altertable.init(apiKey, config);

        // Page event should be queued when consent is pending
        altertable.page('http://localhost/test-page');

        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        expect(altertable['_eventQueue'].getSize()).toBe(1);

        // Clear network calls
        clearNetworkCalls();

        // Change consent to granted
        altertable.configure({ trackingConsent: 'granted' });

        // Queued page event should be sent
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
        } else {
          expect(fetch).toHaveBeenCalledTimes(1);
        }
      });

      it('should handle identify events with different consent states', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'pending',
        };
        altertable.init(apiKey, config);

        altertable.identify('user123', { email: 'user@example.com' });

        // No network calls should be made when consent is pending
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        // User should be set in session manager regardless of consent
        expect(altertable['_sessionManager'].getUserId()).toBe('user123');

        // Change consent to granted
        altertable.configure({ trackingConsent: 'granted' });

        // Queued identify event should be sent
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
        } else {
          expect(fetch).toHaveBeenCalledTimes(1);
        }
      });

      it('should handle updateTraits with different consent states', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'pending',
        };
        altertable.init(apiKey, config);

        // First identify the user
        altertable.identify('user123', { email: 'user@example.com' });

        // Clear network calls
        clearNetworkCalls();

        // Update traits should respect consent
        altertable.updateTraits({ name: 'John Doe' });

        // No network calls should be made when consent is pending
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        // Change consent to granted
        altertable.configure({ trackingConsent: 'granted' });

        // Both queued identify and updateTraits events should be sent
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalledTimes(2);
        } else {
          expect(fetch).toHaveBeenCalledTimes(2);
        }
      });

      it('should handle auto-capture with different consent states', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: true,
          trackingConsent: 'pending',
        };
        altertable.init(apiKey, config);

        // Initial page event should be queued
        expect(altertable['_eventQueue'].getSize()).toBe(1);

        if (mode === 'beacon') {
          expect(navigator.sendBeacon).not.toHaveBeenCalled();
        } else {
          expect(fetch).not.toHaveBeenCalled();
        }

        // Change consent to granted
        altertable.configure({ trackingConsent: 'granted' });

        // Queued page event should be sent
        if (mode === 'beacon') {
          expect(navigator.sendBeacon).toHaveBeenCalled();
        } else {
          expect(fetch).toHaveBeenCalled();
        }
      });

      it('should handle debug logging with different consent states', () => {
        const config: AltertableConfig = {
          baseUrl: 'http://localhost',
          autoCapture: false,
          debug: true,
          trackingConsent: 'pending',
        };

        const logEventSpy = vi
          .spyOn(altertable['_logger'], 'logEvent')
          .mockImplementation(() => {});
        vi.spyOn(altertable['_logger'], 'logHeader').mockImplementation(
          () => {}
        );

        altertable.init(apiKey, config);

        // Track event should be logged even when queued
        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith(
          {
            timestamp: expect.stringMatching(REGEXP_DATE_ISO),
            event: 'test-event',
            user_id: null,
            session_id: expect.stringMatching(REGEXP_SESSION_ID),
            visitor_id: expect.stringMatching(REGEXP_VISITOR_ID),
            environment: 'production',
            properties: expect.objectContaining({
              foo: 'bar',
            }),
          },
          { trackingConsent: 'pending' }
        );
      });
    });
  });
});
