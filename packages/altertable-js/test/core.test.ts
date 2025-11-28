import '../../../test-utils/matchers/toRequestApi';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStorageMock } from '../../../test-utils/mocks/storageMock';
import {
  setupBeaconAvailable,
  setupBeaconUnavailable,
} from '../../../test-utils/networkMode';
import {
  EVENT_PAGEVIEW,
  PREFIX_DEVICE_ID,
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
import { ApiError, NetworkError } from '../src/lib/error';
import * as loggerModule from '../src/lib/logger';
import * as storageModule from '../src/lib/storage';
import { UserId, UserTraits } from '../src/types';

const REGEXP_DATE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REGEXP_SESSION_ID = new RegExp(`^${PREFIX_SESSION_ID}-`);
const REGEXP_DEVICE_ID = new RegExp(`^${PREFIX_DEVICE_ID}-`);
const REGEXP_VISITOR_ID = new RegExp(`^${PREFIX_VISITOR_ID}-`);

function createSessionData(overrides: Record<string, any> = {}) {
  return JSON.stringify({
    distinctId: 'visitor-test-uuid-1-1234567890',
    anonymousId: null,
    sessionId: 'session-test-uuid-2-1234567890',
    deviceId: 'device-test-uuid-3-1234567890',
    lastEventAt: null,
    trackingConsent: 'granted',
    ...overrides,
  });
}

function setupWindow({
  url = 'http://localhost/page',
  referrer = null,
}: { url?: string; referrer?: string | null } = {}) {
  Object.defineProperty(global.window, 'location', {
    value: { href: url },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(global.window.document, 'referrer', {
    value: referrer,
    writable: true,
    configurable: true,
  });
}

describe('Altertable', () => {
  let altertable: Altertable;
  const apiKey = 'test-api-key';
  const viewPort = '1024x768';

  function setupAltertable(overrides: Partial<AltertableConfig> = {}) {
    return altertable.init(apiKey, {
      baseUrl: 'http://localhost',
      autoCapture: false,
      trackingConsent: 'granted',
      persistence: 'memory',
      ...overrides,
    });
  }

  beforeEach(async () => {
    // Mock crypto.randomUUID for deterministic testing
    let idCounter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      idCounter++;
      return `test-uuid-${idCounter}-${Date.now()}` as `${string}-${string}-${string}-${string}-${string}`;
    });

    // Mock createLogger, but keep warn and warnDev to be caught with .toWarnDev()
    const realLoggerFactory = (
      await vi.importActual<typeof import('../src/lib/logger')>(
        '../src/lib/logger'
      )
    ).createLogger;
    vi.spyOn(loggerModule, 'createLogger').mockImplementation((...args) => {
      const logger = realLoggerFactory(...args);
      return {
        ...logger,
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        logHeader: vi.fn(),
        logEvent: vi.fn(),
      };
    });

    // Default to beacon available
    setupBeaconAvailable();

    if (altertable?.['_isInitialized']) {
      altertable.reset({ resetDeviceId: true });
    }
    altertable = new Altertable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    describe('successful initialization', () => {
      it('sends page event with current URL when auto-capture enabled', () => {
        setupWindow({
          url: 'http://localhost/test-page?foo=bar&baz=qux',
        });

        expect(() => {
          altertable.init(apiKey, {
            baseUrl: 'http://localhost',
            autoCapture: true,
            trackingConsent: 'granted',
          });
        }).toRequestApi('/track', {
          apiKey,
          baseUrl: 'http://localhost',
          payload: {
            event: EVENT_PAGEVIEW,
            timestamp: expect.stringMatching(REGEXP_DATE_ISO),
            device_id: expect.stringMatching(REGEXP_DEVICE_ID),
            distinct_id: expect.stringMatching(REGEXP_VISITOR_ID),
            anonymous_id: null,
            session_id: expect.stringMatching(REGEXP_SESSION_ID),
            environment: 'production',
            properties: {
              [PROPERTY_LIB]: 'TEST_LIB_NAME',
              [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
              [PROPERTY_URL]: 'http://localhost/test-page',
              [PROPERTY_VIEWPORT]: viewPort,
              [PROPERTY_REFERER]: null,
              foo: 'bar',
              baz: 'qux',
            },
          },
        });
      });

      it('uses default base URL when not specified', () => {
        altertable.init(apiKey, {
          autoCapture: false,
          trackingConsent: 'granted',
        });

        expect(() => {
          altertable.track('eventName', { foo: 'bar' });
        }).toRequestApi('/track', {
          apiKey,
          baseUrl: 'https://api.altertable.ai',
          payload: {
            event: 'eventName',
            device_id: expect.stringMatching(REGEXP_DEVICE_ID),
            distinct_id: expect.stringMatching(REGEXP_VISITOR_ID),
            timestamp: expect.stringMatching(REGEXP_DATE_ISO),
            anonymous_id: null,
            session_id: expect.stringMatching(REGEXP_SESSION_ID),
            environment: 'production',
            properties: {
              [PROPERTY_LIB]: 'TEST_LIB_NAME',
              [PROPERTY_LIB_VERSION]: 'TEST_LIB_VERSION',
              foo: 'bar',
            },
          },
        });
      });

      it('includes release ID in properties when specified', () => {
        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          release: '04ed05b',
          trackingConsent: 'granted',
        });

        expect(() => {
          altertable.track('eventName');
        }).toRequestApi('/track', {
          payload: expect.objectContaining({
            event: 'eventName',
            properties: expect.objectContaining({
              [PROPERTY_RELEASE]: '04ed05b',
            }),
          }),
        });
      });

      it('does not send page event when auto-capture disabled', () => {
        expect(() => {
          altertable.init(apiKey, {
            baseUrl: 'http://localhost',
            autoCapture: false,
            trackingConsent: 'granted',
          });
        }).not.toRequestApi('/track');
      });

      it('detects URL changes and sends page events', () => {
        setupWindow({ url: 'http://localhost/initial-page' });

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: true,
          trackingConsent: 'granted',
        });

        // Simulate URL change and trigger page event directly
        setupWindow({ url: 'http://localhost/changed-page' });

        expect(() => {
          altertable.page('http://localhost/changed-page');
        }).toRequestApi('/track', {
          payload: expect.objectContaining({
            event: EVENT_PAGEVIEW,
            properties: expect.objectContaining({
              [PROPERTY_URL]: 'http://localhost/changed-page',
            }),
          }),
        });
      });

      it('tracks referrer when URL changes', () => {
        setupWindow({ url: 'http://localhost/initial-page' });

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: true,
          trackingConsent: 'granted',
        });

        setupWindow({ url: 'http://localhost/changed-page' });
        altertable['_checkForChanges']();

        expect(altertable['_referrer']).toBe('http://localhost/initial-page');
      });

      it('properly cleans up auto-capture listeners', () => {
        const addEventListenerSpy = vi.spyOn(global.window, 'addEventListener');
        const removeEventListenerSpy = vi.spyOn(
          global.window,
          'removeEventListener'
        );
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: true,
          trackingConsent: 'granted',
        });

        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'popstate',
          expect.any(Function)
        );
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'hashchange',
          expect.any(Function)
        );

        altertable.configure({ autoCapture: false });

        expect(removeEventListenerSpy).toHaveBeenCalledWith(
          'popstate',
          expect.any(Function)
        );
        expect(removeEventListenerSpy).toHaveBeenCalledWith(
          'hashchange',
          expect.any(Function)
        );
        expect(clearIntervalSpy).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('throws when API key is empty', () => {
        expect(() => {
          altertable.init('', { baseUrl: 'http://localhost' });
        }).toThrow('[Altertable] Missing API key');
      });

      it('throws when API key is null', () => {
        expect(() => {
          altertable.init(null as any, { baseUrl: 'http://localhost' });
        }).toThrow('[Altertable] Missing API key');
      });

      it('throws when API key is undefined', () => {
        expect(() => {
          altertable.init(undefined as any, { baseUrl: 'http://localhost' });
        }).toThrow('[Altertable] Missing API key');
      });
    });
  });

  describe('tracking', () => {
    describe('track() method', () => {
      it('sends track event with custom properties', () => {
        setupAltertable();

        expect(() => {
          altertable.track('eventName', { foo: 'bar' });
        }).toRequestApi('/track', {
          payload: expect.objectContaining({
            event: 'eventName',
            properties: expect.objectContaining({
              foo: 'bar',
            }),
          }),
        });
      });

      it('throws when called before initialization', () => {
        const uninitializedAltertable = new Altertable();
        expect(() => {
          uninitializedAltertable.track('test-event', { foo: 'bar' });
        }).toThrow(
          '[Altertable] The client must be initialized with init() before tracking events.'
        );
      });

      it('always includes current URL in track events', () => {
        setupWindow({ url: 'http://localhost/test-page?param=value' });
        setupAltertable();

        expect(() => {
          altertable.track('eventName', { foo: 'bar' });
        }).toRequestApi('/track', {
          payload: expect.objectContaining({
            event: 'eventName',
            properties: expect.objectContaining({
              [PROPERTY_URL]: 'http://localhost/test-page',
              foo: 'bar',
            }),
          }),
        });
      });

      it('handles malformed URLs gracefully', () => {
        setupWindow({ url: 'not-a-valid-url' });
        setupAltertable();

        expect(() => {
          altertable.track('eventName');
        }).toRequestApi('/track', {
          payload: expect.objectContaining({
            event: 'eventName',
            properties: expect.objectContaining({
              [PROPERTY_URL]: 'not-a-valid-url',
            }),
          }),
        });
      });

      it('works when no URL is available', () => {
        // Mock window to be undefined to simulate SSR environment
        const originalWindow = global.window;
        delete (global as any).window;

        setupAltertable();

        expect(() => {
          altertable.track('eventName', { foo: 'bar' });
        }).toRequestApi('/track', {
          payload: expect.objectContaining({
            event: 'eventName',
            properties: expect.objectContaining({
              foo: 'bar',
            }),
          }),
        });

        // Restore window
        global.window = originalWindow;
      });
    });

    describe('page() method', () => {
      it('sends page event with specified URL', () => {
        setupAltertable();

        expect(() => {
          altertable.page('http://localhost/test-page');
        }).toRequestApi('/track', {
          payload: expect.objectContaining({
            event: EVENT_PAGEVIEW,
            properties: expect.objectContaining({
              [PROPERTY_URL]: 'http://localhost/test-page',
            }),
          }),
        });
      });

      it('throws when called before initialization', () => {
        const uninitializedAltertable = new Altertable();
        expect(() => {
          uninitializedAltertable.page('http://localhost/test');
        }).toThrow(
          '[Altertable] The client must be initialized with init() before tracking page views.'
        );
      });
    });
  });

  describe('configuration', () => {
    describe('configure() method', () => {
      it('throws when called before initialization', () => {
        expect(() => {
          altertable.configure({ debug: true });
        }).toThrow(
          '[Altertable] The client must be initialized with init() before configuring.'
        );
      });

      it('updates single configuration option', () => {
        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          debug: false,
          trackingConsent: 'granted',
        });

        altertable.configure({ debug: true });

        const logEventSpy = vi.spyOn(altertable['_logger'], 'logEvent');
        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'test-event',
            properties: expect.objectContaining({
              foo: 'bar',
            }),
          }),
          { trackingConsent: 'granted' }
        );
      });

      it('updates multiple configuration options at once', () => {
        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          debug: false,
          environment: 'production',
          trackingConsent: 'granted',
        });

        altertable.configure({
          debug: true,
          environment: 'staging',
          release: 'v1.0.0',
        });

        const logEventSpy = vi.spyOn(altertable['_logger'], 'logEvent');
        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'test-event',
            environment: 'staging',
            properties: expect.objectContaining({
              [PROPERTY_RELEASE]: 'v1.0.0',
              foo: 'bar',
            }),
          }),
          { trackingConsent: 'granted' }
        );
      });
    });

    describe('debug logging', () => {
      it('calls logHeader when debug enabled on init', () => {
        const logHeaderSpy = vi.spyOn(altertable['_logger'], 'logHeader');

        altertable.init('TEST_API_KEY', {
          debug: true,
          autoCapture: false,
          trackingConsent: 'granted',
        });

        expect(logHeaderSpy).toHaveBeenCalledTimes(1);
      });

      it('does not call logHeader when debug disabled on init', () => {
        const logHeaderSpy = vi.spyOn(altertable['_logger'], 'logHeader');

        altertable.init('TEST_API_KEY', {
          debug: false,
          autoCapture: false,
          trackingConsent: 'granted',
        });

        expect(logHeaderSpy).toHaveBeenCalledTimes(0);
      });

      it('calls logEvent when debug enabled and track called', () => {
        const logEventSpy = vi.spyOn(altertable['_logger'], 'logEvent');

        altertable.init('TEST_API_KEY', {
          debug: true,
          autoCapture: false,
          trackingConsent: 'granted',
        });

        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'test-event',
            properties: expect.objectContaining({
              foo: 'bar',
            }),
          }),
          { trackingConsent: 'granted' }
        );
      });

      it('does not call logEvent when debug disabled and track called', () => {
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

  describe('persistence configuration', () => {
    it('uses localStorage+cookie as default persistence strategy', () => {
      const selectStorageSpy = vi
        .spyOn(storageModule, 'selectStorage')
        .mockReturnValue(createStorageMock());

      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
      });

      expect(selectStorageSpy).toHaveBeenCalledWith('localStorage+cookie', {
        onFallback: expect.any(Function),
      });
    });

    it('uses custom persistence strategy when provided', () => {
      const selectStorageSpy = vi
        .spyOn(storageModule, 'selectStorage')
        .mockReturnValue(createStorageMock());

      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
        persistence: 'memory',
      });

      expect(selectStorageSpy).toHaveBeenCalledWith('memory', {
        onFallback: expect.any(Function),
      });
    });

    it('warns when storage fallback occurs', () => {
      const warnSpy = vi.spyOn(altertable['_logger'], 'warn');

      vi.spyOn(storageModule, 'selectStorage').mockImplementation(
        (_type, { onFallback }) => {
          onFallback('localStorage not supported, falling back to memory.');
          return createStorageMock();
        }
      );

      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
        persistence: 'localStorage',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        'localStorage not supported, falling back to memory.'
      );
    });
  });

  describe('user identification', () => {
    describe('identify() method', () => {
      it('identifies user with valid user ID and empty traits', () => {
        setupAltertable();
        const userId: UserId = 'user123';

        expect(() => {
          altertable.identify(userId);
        }).toRequestApi('/identify', {
          payload: {
            environment: 'production',
            device_id: expect.stringMatching(REGEXP_DEVICE_ID),
            traits: {},
            distinct_id: userId,
            anonymous_id: expect.stringMatching(REGEXP_VISITOR_ID),
          },
        });
      });

      it('identifies user with valid user ID and traits', () => {
        setupAltertable();
        const userId: UserId = 'user123';
        const traits: UserTraits = { email: 'user@example.com' };

        expect(() => {
          altertable.identify(userId, traits);
        }).toRequestApi('/identify', {
          payload: {
            environment: 'production',
            device_id: expect.stringMatching(REGEXP_DEVICE_ID),
            traits,
            distinct_id: userId,
            anonymous_id: expect.stringMatching(REGEXP_VISITOR_ID),
          },
        });
      });

      it('throws error for reserved user ID', () => {
        setupAltertable();
        expect(() => {
          altertable.identify('anonymous_id');
        }).toThrow(
          '[Altertable] User ID "anonymous_id" is a reserved identifier and cannot be used.'
        );
      });

      it('throws error for empty user ID', () => {
        setupAltertable();
        expect(() => {
          altertable.identify('');
        }).toThrow(
          '[Altertable] User ID cannot be empty or contain only whitespace.'
        );
      });

      it('throws error when calling identify on an already identified user', () => {
        setupAltertable();
        altertable.identify('user123', { email: 'user@example.com' });
        expect(() => {
          altertable.identify('user124', { email: 'user@example.com' });
        }).toThrowError(
          expect.objectContaining({
            message: expect.stringContaining(
              '[Altertable] User (user124) is already identified as a different user (user123). This usually indicates a development issue, as it would merge two separate identities. Call reset() before identifying a new user, or use alias() to link the new ID to the existing one.'
            ),
          })
        );
      });

      it('throws when called before initialization', () => {
        const uninitializedAltertable = new Altertable();
        expect(() => {
          uninitializedAltertable.identify('user123');
        }).toThrow(
          '[Altertable] The client must be initialized with init() before identifying users.'
        );
      });

      it('logs identify events when debug mode is enabled', () => {
        const consoleSpy = vi
          .spyOn(console, 'groupCollapsed')
          .mockImplementation(() => {});
        const consoleLogSpy = vi
          .spyOn(console, 'log')
          .mockImplementation(() => {});
        const consoleTableSpy = vi
          .spyOn(console, 'table')
          .mockImplementation(() => {});
        const consoleGroupEndSpy = vi
          .spyOn(console, 'groupEnd')
          .mockImplementation(() => {});

        setupAltertable({ debug: true });
        altertable.identify('user123', { email: 'user@example.com' });

        expect(consoleSpy).toHaveBeenCalledWith(
          '[Altertable] %cIdentify%c user123 %c[production] %c',
          'background: #a855f7; color: #ffffff; padding: 2px 8px; border-radius: 6px; font-weight: 400;',
          'font-weight: 600;',
          'color: #ef4444; font-weight: 400;',
          ''
        );

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '%cUser ID %cuser123',
          expect.any(String),
          expect.any(String)
        );

        expect(consoleTableSpy).toHaveBeenCalledWith({
          email: 'user@example.com',
        });

        expect(consoleGroupEndSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
        consoleLogSpy.mockRestore();
        consoleTableSpy.mockRestore();
        consoleGroupEndSpy.mockRestore();
      });
    });

    describe('updateTraits() method', () => {
      it('updates traits for identified user', () => {
        setupAltertable();
        altertable.identify('user123', { email: 'user@example.com' });

        const newTraits = { name: 'John Doe', plan: 'premium' };
        expect(() => {
          altertable.updateTraits(newTraits);
        }).toRequestApi('/identify', {
          payload: {
            environment: 'production',
            device_id: expect.stringMatching(REGEXP_DEVICE_ID),
            traits: newTraits,
            distinct_id: 'user123',
            anonymous_id: expect.stringMatching(REGEXP_VISITOR_ID),
          },
        });
      });

      it('throws when called without identifying user', () => {
        setupAltertable();
        expect(() => {
          altertable.updateTraits({ email: 'user@example.com' });
        }).toThrow(
          '[Altertable] User must be identified with identify() before updating traits.'
        );
      });

      it('logs updateTraits events when debug mode is enabled', () => {
        const consoleSpy = vi
          .spyOn(console, 'groupCollapsed')
          .mockImplementation(() => {});
        const consoleLogSpy = vi
          .spyOn(console, 'log')
          .mockImplementation(() => {});
        const consoleTableSpy = vi
          .spyOn(console, 'table')
          .mockImplementation(() => {});
        const consoleGroupEndSpy = vi
          .spyOn(console, 'groupEnd')
          .mockImplementation(() => {});

        setupAltertable({ debug: true });
        altertable.identify('user123', { email: 'user@example.com' });

        // Clear previous calls
        consoleSpy.mockClear();
        consoleLogSpy.mockClear();
        consoleTableSpy.mockClear();
        consoleGroupEndSpy.mockClear();

        altertable.updateTraits({ name: 'John Doe', plan: 'premium' });

        expect(consoleSpy).toHaveBeenCalledWith(
          '[Altertable] %cIdentify%c user123 %c[production] %c',
          'background: #a855f7; color: #ffffff; padding: 2px 8px; border-radius: 6px; font-weight: 400;',
          'font-weight: 600;',
          'color: #ef4444; font-weight: 400;',
          ''
        );

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '%cUser ID %cuser123',
          expect.any(String),
          expect.any(String)
        );

        expect(consoleTableSpy).toHaveBeenCalledWith({
          name: 'John Doe',
          plan: 'premium',
        });

        expect(consoleGroupEndSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
        consoleLogSpy.mockRestore();
        consoleTableSpy.mockRestore();
        consoleGroupEndSpy.mockRestore();
      });
    });
  });

  describe('alias() method', () => {
    it('aliases user to a new ID', () => {
      setupAltertable();
      // Spy on the requester.send method to check /alias is called
      const requesterSendSpy = vi.spyOn(altertable['_requester'], 'send');

      altertable.alias('user456');

      expect(requesterSendSpy).toHaveBeenCalledWith(
        '/alias',
        expect.objectContaining({
          environment: expect.any(String),
          device_id: expect.stringMatching(REGEXP_DEVICE_ID),
          distinct_id: 'user456',
          anonymous_id: expect.stringMatching(REGEXP_VISITOR_ID),
          session_id: expect.stringMatching(REGEXP_SESSION_ID),
        })
      );

      requesterSendSpy.mockRestore();
    });

    it('can call alias before identifying the user', () => {
      setupAltertable();

      expect(() => {
        altertable.alias('user456');
      }).toRequestApi('/alias', {
        payload: expect.objectContaining({
          distinct_id: 'user456',
          anonymous_id: expect.stringMatching(REGEXP_VISITOR_ID),
        }),
      });

      expect(() => {
        altertable.identify('user123', { email: 'user@example.com' });
      }).toRequestApi('/identify');
    });

    it('can call alias after identifying the user', () => {
      setupAltertable();

      altertable.identify('user123', { email: 'user@example.com' });

      expect(() => {
        altertable.alias('user456');
      }).toRequestApi('/alias', {
        payload: expect.objectContaining({
          distinct_id: 'user456',
          anonymous_id: 'user123',
        }),
      });
    });
  });

  describe('session management', () => {
    describe('session ID generation', () => {
      it('generates new session ID on initialization', () => {
        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
        });

        const sessionId = altertable['_sessionManager'].getSessionId();
        expect(sessionId).toMatch(REGEXP_SESSION_ID);
      });

      it('persists session ID across page reloads', () => {
        const testVisitorId = 'visitor-test-uuid-1-1234567890';
        const testSessionId = 'session-test-uuid-2-1234567890';
        const existingSessionData = createSessionData({
          visitorId: testVisitorId,
          sessionId: testSessionId,
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock({
            getItem: vi.fn().mockReturnValue(existingSessionData),
          })
        );

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
        });

        const sessionId = altertable['_sessionManager'].getSessionId();
        expect(sessionId).toBe(testSessionId);
      });
    });

    describe('session renewal', () => {
      it('regenerates session ID when event sent after 30 minutes', () => {
        vi.useFakeTimers();
        const testVisitorId = 'visitor-test-uuid-3-1234567890';
        const testSessionId = 'session-test-uuid-4-1234567890';
        const thirtyMinutesAgo = new Date(
          Date.now() - 30 * 60 * 1000 - 1000
        ).toISOString();
        const existingSessionData = createSessionData({
          visitorId: testVisitorId,
          sessionId: testSessionId,
          lastEventAt: thirtyMinutesAgo,
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock({
            getItem: vi.fn().mockReturnValue(existingSessionData),
          })
        );

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
        });

        const initialSessionId = altertable['_sessionManager'].getSessionId();
        expect(initialSessionId).toBe(testSessionId);

        expect(() => {
          altertable.track('test-event', { foo: 'bar' });
        }).toRequestApi('/track', {
          payload: expect.objectContaining({
            event: 'test-event',
            session_id: expect.stringMatching(REGEXP_SESSION_ID),
            properties: expect.objectContaining({
              foo: 'bar',
            }),
          }),
        });

        const newSessionId = altertable['_sessionManager'].getSessionId();
        expect(newSessionId).not.toBe(testSessionId);
        expect(newSessionId).toMatch(REGEXP_SESSION_ID);

        vi.useRealTimers();
      });

      it('does not regenerate session ID when event sent within 30 minutes', () => {
        vi.useFakeTimers();
        const testVisitorId = 'visitor-test-uuid-5-1234567890';
        const testSessionId = 'session-test-uuid-6-1234567890';
        const twentyNineMinutesAgo = new Date(
          Date.now() - 29 * 60 * 1000
        ).toISOString();
        const existingSessionData = createSessionData({
          visitorId: testVisitorId,
          sessionId: testSessionId,
          lastEventAt: twentyNineMinutesAgo,
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock({
            getItem: vi.fn().mockReturnValue(existingSessionData),
          })
        );

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
        });

        const initialSessionId = altertable['_sessionManager'].getSessionId();
        expect(initialSessionId).toBe(testSessionId);

        expect(() => {
          altertable.track('test-event', { foo: 'bar' });
        }).toRequestApi('/track', {
          payload: expect.objectContaining({
            event: 'test-event',
            session_id: testSessionId,
            properties: expect.objectContaining({
              foo: 'bar',
            }),
          }),
        });

        const currentSessionId = altertable['_sessionManager'].getSessionId();
        expect(currentSessionId).toBe(testSessionId);

        vi.useRealTimers();
      });
    });

    describe('reset() method', () => {
      it('resets user ID when called', () => {
        setupAltertable();
        altertable.identify('user123', { email: 'user@example.com' });

        const originalUserId = altertable['_sessionManager'].getDistinctId();
        expect(originalUserId).toBe('user123');

        altertable.reset();
        const distinctId = altertable['_sessionManager'].getDistinctId();
        expect(distinctId).toMatch(REGEXP_VISITOR_ID);
        const anonymousId = altertable['_sessionManager'].getAnonymousId();
        expect(anonymousId).toBeNull();
      });

      it('resets session ID when called with default parameters', () => {
        setupAltertable();
        altertable.identify('user123', { email: 'user@example.com' });

        const originalSessionId = altertable['_sessionManager'].getSessionId();
        const originalUserId = altertable['_sessionManager'].getDistinctId();

        expect(originalUserId).toBe('user123');

        altertable.reset();

        const newSessionId = altertable['_sessionManager'].getSessionId();
        expect(newSessionId).not.toEqual(originalSessionId);
        expect(newSessionId).toMatch(REGEXP_SESSION_ID);

        const newDistinctId = altertable['_sessionManager'].getDistinctId();
        expect(newDistinctId).toMatch(REGEXP_VISITOR_ID);
        const newAnonymousId = altertable['_sessionManager'].getAnonymousId();
        expect(newAnonymousId).toBeNull();
      });

      it('resets device ID when called with resetDeviceId', () => {
        setupAltertable();
        altertable.identify('user123', { email: 'user@example.com' });

        const originalDeviceId = altertable['_sessionManager'].getDeviceId();

        altertable.reset({ resetDeviceId: true });

        const newDeviceId = altertable['_sessionManager'].getDeviceId();
        expect(newDeviceId).not.toEqual(originalDeviceId);
        expect(newDeviceId).toMatch(REGEXP_DEVICE_ID);
      });

      it('throws when called before initialization', () => {
        const uninitializedAltertable = new Altertable();
        expect(() => {
          uninitializedAltertable.reset();
        }).toThrow(
          '[Altertable] The client must be initialized with init() before resetting.'
        );
      });
    });
  });

  describe('storage system', () => {
    describe('data persistence', () => {
      it('saves user data to storage when identify called', () => {
        const storageMock = createStorageMock();

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        });
        altertable.identify('user123', { email: 'user@example.com' });

        expect(storageMock.setItem).toHaveBeenCalledWith(
          'atbl.test-api-key.production',
          expect.stringContaining('"distinctId":"user123"')
        );

        const lastCall =
          storageMock.setItem.mock.calls[
            storageMock.setItem.mock.calls.length - 1
          ];
        const storedData = JSON.parse(lastCall[1]);
        expect(storedData).toMatchObject({
          anonymousId: expect.stringMatching(REGEXP_VISITOR_ID),
          sessionId: expect.stringMatching(REGEXP_SESSION_ID),
          distinctId: 'user123',
          lastEventAt: null,
        });
      });

      it('recovers storage data on initialization', () => {
        const testAnonymousId = 'visitor-test-uuid-3-1234567890';
        const testSessionId = 'session-test-uuid-4-1234567890';
        const existingData = createSessionData({
          anonymousId: testAnonymousId,
          sessionId: testSessionId,
          distinctId: 'user123',
          lastEventAt: '2023-01-01T00:00:00.000Z',
        });

        const storageMock = createStorageMock({
          getItem: vi.fn().mockReturnValue(existingData),
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        });

        const anonymousId = altertable['_sessionManager'].getAnonymousId();
        const sessionId = altertable['_sessionManager'].getSessionId();
        const distinctId = altertable['_sessionManager'].getDistinctId();
        const lastEventAt = altertable['_sessionManager'].getLastEventAt();
        expect(anonymousId).toBe(testAnonymousId);
        expect(sessionId).toBe(testSessionId);
        expect(distinctId).toBe('user123');
        expect(lastEventAt).toBe('2023-01-01T00:00:00.000Z');
      });

      it('handles corrupted storage data gracefully', () => {
        const storageMock = createStorageMock({
          getItem: vi.fn().mockReturnValue('invalid-json'),
        });

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        expect(() => {
          altertable.init(apiKey, {
            baseUrl: 'http://localhost',
            autoCapture: false,
            trackingConsent: 'granted',
          });
        }).toWarnDev(
          '[Altertable] Failed to parse storage data. Resetting session data.'
        );

        const distinctId = altertable['_sessionManager'].getDistinctId();
        const sessionId = altertable['_sessionManager'].getSessionId();
        const anonymousId = altertable['_sessionManager'].getAnonymousId();
        expect(distinctId).toMatch(REGEXP_VISITOR_ID);
        expect(sessionId).toMatch(REGEXP_SESSION_ID);
        expect(anonymousId).toBeNull();
      });
    });

    describe('storage key construction', () => {
      it('constructs storage key with default environment when not specified', () => {
        const storageMock = createStorageMock();

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        });

        expect(storageMock.setItem).toHaveBeenCalledWith(
          'atbl.test-api-key.production',
          expect.anything()
        );
      });

      it('constructs storage key with development environment', () => {
        const storageMock = createStorageMock();

        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          environment: 'development',
          trackingConsent: 'granted',
        });

        expect(storageMock.setItem).toHaveBeenCalledWith(
          'atbl.test-api-key.development',
          expect.anything()
        );
      });
    });

    describe('storage migration', () => {
      it('migrates data when persistence strategy changes', () => {
        const initialStorageMock = createStorageMock();
        const newStorageMock = createStorageMock();
        const migrateSpy = vi.fn();

        newStorageMock.migrate = migrateSpy;

        vi.spyOn(storageModule, 'selectStorage')
          .mockReturnValueOnce(initialStorageMock)
          .mockReturnValueOnce(newStorageMock);

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          persistence: 'localStorage+cookie',
          trackingConsent: 'granted',
        });

        altertable.configure({ persistence: 'memory' });

        expect(migrateSpy).toHaveBeenCalledWith(initialStorageMock, [
          'atbl.test-api-key.production',
        ]);
      });

      it('preserves data during migration', () => {
        const initialStorageMock = createStorageMock();
        const newStorageMock = createStorageMock();
        const migrateSpy = vi.fn();

        newStorageMock.migrate = migrateSpy;

        vi.spyOn(storageModule, 'selectStorage')
          .mockReturnValueOnce(initialStorageMock)
          .mockReturnValueOnce(newStorageMock);

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          persistence: 'localStorage+cookie',
          trackingConsent: 'granted',
        });

        altertable.identify('user123', { email: 'user@example.com' });

        altertable.configure({ persistence: 'memory' });

        expect(migrateSpy).toHaveBeenCalled();
        expect(altertable['_sessionManager'].getDistinctId()).toBe('user123');
      });
    });
  });

  describe('tracking consent', () => {
    describe('consent states', () => {
      it('defaults to granted consent when not specified', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
        });

        expect(altertable.getTrackingConsent()).toBe('granted');
        expect(() => {
          altertable.track('test-event', { foo: 'bar' });
        }).toRequestApi('/track');
      });

      it('sends events immediately when consent is granted', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'granted' });

        expect(() => {
          altertable.track('test-event', { foo: 'bar' });
        }).toRequestApi('/track');
      });

      it('queues events when consent is pending', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'pending' });

        expect(() => {
          altertable.track('test-event-1', { foo: 'bar' });
          altertable.track('test-event-2', { baz: 'qux' });
        }).not.toRequestApi('/track');

        expect(altertable['_eventQueue'].getSize()).toBe(2);
      });

      it('queues events when consent is dismissed', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'dismissed' });

        expect(() => {
          altertable.track('test-event', { foo: 'bar' });
        }).not.toRequestApi('/track');

        expect(altertable['_eventQueue'].getSize()).toBe(1);
      });

      it('does not collect or send events when consent is denied', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'denied' });

        expect(() => {
          altertable.track('test-event', { foo: 'bar' });
        }).not.toRequestApi('/track');

        expect(altertable['_eventQueue'].getSize()).toBe(0);
      });
    });

    describe('consent transitions', () => {
      it('flushes queued events when consent changes from pending to granted', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'pending' });

        altertable.track('test-event-1', { foo: 'bar' });
        altertable.track('test-event-2', { baz: 'qux' });

        expect(altertable['_eventQueue'].getSize()).toBe(2);

        expect(() => {
          altertable.configure({ trackingConsent: 'granted' });
        }).toRequestApi('/track', { callCount: 2 });

        expect(altertable['_eventQueue'].getSize()).toBe(0);
      });

      it('flushes queued events when consent changes from dismissed to granted', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'dismissed' });

        altertable.track('test-event-1', { foo: 'bar' });
        altertable.track('test-event-2', { baz: 'qux' });

        expect(altertable['_eventQueue'].getSize()).toBe(2);

        expect(() => {
          altertable.configure({ trackingConsent: 'granted' });
        }).toRequestApi('/track', { callCount: 2 });

        expect(altertable['_eventQueue'].getSize()).toBe(0);
      });

      it('clears queued events when consent changes to denied', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'pending' });

        altertable.track('test-event-1', { foo: 'bar' });
        altertable.track('test-event-2', { baz: 'qux' });

        expect(altertable['_eventQueue'].getSize()).toBe(2);

        altertable.configure({ trackingConsent: 'denied' });

        expect(altertable['_eventQueue'].getSize()).toBe(0);
      });

      it('does not flush events when consent changes from granted to pending', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'granted' });

        expect(() => {
          altertable.track('test-event-1', { foo: 'bar' });
        }).toRequestApi('/track');

        altertable.configure({ trackingConsent: 'pending' });

        expect(() => {
          altertable.track('test-event-2', { foo: 'bar' });
        }).not.toRequestApi('/track');
      });
    });

    describe('consent state management', () => {
      it('gets current tracking consent state', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'pending' });

        expect(altertable.getTrackingConsent()).toBe('pending');

        altertable.configure({ trackingConsent: 'granted' });
        expect(altertable.getTrackingConsent()).toBe('granted');
      });
    });

    describe('event handling with different consent states', () => {
      it('handles page events with different consent states', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'pending' });

        expect(() => {
          altertable.page('http://localhost/test-page');
        }).not.toRequestApi('/track');

        expect(altertable['_eventQueue'].getSize()).toBe(1);

        expect(() => {
          altertable.configure({ trackingConsent: 'granted' });
        }).toRequestApi('/track');
      });

      it('handles identify events with different consent states', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'pending' });

        expect(() => {
          altertable.identify('user123', { email: 'user@example.com' });
        }).not.toRequestApi('/identify');

        expect(altertable['_sessionManager'].getDistinctId()).toBe('user123');

        expect(() => {
          altertable.configure({ trackingConsent: 'granted' });
        }).toRequestApi('/identify');
      });

      it('handles updateTraits with different consent states', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({ trackingConsent: 'pending' });

        altertable.identify('user123', { email: 'user@example.com' });

        expect(() => {
          altertable.updateTraits({ name: 'John Doe' });
        }).not.toRequestApi('/identify');

        expect(() => {
          altertable.configure({ trackingConsent: 'granted' });
        }).toRequestApi('/identify', { callCount: 2 });
      });

      it('handles auto-capture with different consent states', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        expect(() => {
          setupAltertable({
            autoCapture: true,
            trackingConsent: 'pending',
          });
        }).not.toRequestApi('/track');

        expect(altertable['_eventQueue'].getSize()).toBe(1);

        expect(() => {
          altertable.configure({ trackingConsent: 'granted' });
        }).toRequestApi('/track');
      });

      it('handles debug logging with different consent states', () => {
        vi.spyOn(storageModule, 'selectStorage').mockReturnValue(
          createStorageMock()
        );

        setupAltertable({
          debug: true,
          trackingConsent: 'pending',
        });

        const logEventSpy = vi.spyOn(altertable['_logger'], 'logEvent');

        altertable.track('test-event', { foo: 'bar' });

        expect(logEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'test-event',
            properties: expect.objectContaining({
              foo: 'bar',
            }),
          }),
          { trackingConsent: 'pending' }
        );
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete user journey with consent flow', () => {
      const storageMock = createStorageMock({
        getItem: vi.fn().mockReturnValue(null),
      });
      vi.spyOn(storageModule, 'selectStorage').mockReturnValue(storageMock);

      // 1. Initialize with pending consent
      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: 'pending',
      });

      expect(altertable.getTrackingConsent()).toBe('pending');

      // 2. Track events (should queue)
      altertable.track('event-1', { step: 'initial' });
      altertable.track('event-2', { step: 'browsing' });
      expect(altertable['_eventQueue'].getSize()).toBe(2);

      // 3. Identify user (should queue)
      altertable.identify('user123', { email: 'user@example.com' });
      expect(altertable['_eventQueue'].getSize()).toBe(3);

      // 4. Grant consent (should flush queue)
      expect(() => {
        altertable.configure({ trackingConsent: 'granted' });
      }).toRequestApi('/track', { callCount: 3 });

      expect(altertable['_eventQueue'].getSize()).toBe(0);

      // 5. Track more events (should send immediately)
      expect(() => {
        altertable.track('event-3', { step: 'converted' });
      }).toRequestApi('/track');

      // 6. Reset (should clear state)
      altertable.reset();
      expect(altertable['_sessionManager'].getDistinctId()).toMatch(
        REGEXP_VISITOR_ID
      );
      expect(altertable['_sessionManager'].getAnonymousId()).toBeNull();
      expect(altertable['_sessionManager'].getSessionId()).toMatch(
        REGEXP_SESSION_ID
      );
    });

    it('should handle session renewal during user activity', () => {
      vi.useFakeTimers();

      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: 'granted',
      });

      const initialSessionId = altertable['_sessionManager'].getSessionId();

      // Simulate 31 minutes passing (beyond session expiration)
      vi.advanceTimersByTime(31 * 60 * 1000);

      expect(() => {
        altertable.track('event-after-timeout', { foo: 'bar' });
      }).toRequestApi('/track', {
        payload: expect.objectContaining({
          event: 'event-after-timeout',
          session_id: expect.stringMatching(REGEXP_SESSION_ID),
          properties: expect.objectContaining({
            foo: 'bar',
          }),
        }),
      });

      const newSessionId = altertable['_sessionManager'].getSessionId();
      expect(newSessionId).not.toBe(initialSessionId);
      expect(newSessionId).toMatch(REGEXP_SESSION_ID);

      vi.useRealTimers();
    });

    it('should handle rapid configuration changes without memory leaks', () => {
      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: 'granted',
      });

      const configureSpy = vi.spyOn(altertable, 'configure');

      // Rapid configuration changes
      for (let i = 0; i < 10; i++) {
        altertable.configure({
          debug: i % 2 === 0,
          environment: i % 2 === 0 ? 'production' : 'development',
        });
      }

      expect(configureSpy).toHaveBeenCalledTimes(10);

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track');
    });
  });

  describe('multiple init() calls', () => {
    it('updates configuration when calling init() again', () => {
      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
        debug: true,
        trackingConsent: 'granted',
      });

      const logEventSpy = vi.spyOn(altertable['_logger'], 'logEvent');

      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
        debug: false,
        trackingConsent: 'granted',
      });

      altertable.track('test-event', { foo: 'bar' });
      expect(logEventSpy).not.toHaveBeenCalled();
    });

    it('updates the API key when calling init() with a new key', () => {
      altertable.init('api-key-1', {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: 'granted',
      });

      altertable.init('api-key-2', {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: 'granted',
      });

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track', {
        apiKey: 'api-key-2',
        payload: expect.objectContaining({
          event: 'test-event',
          properties: expect.objectContaining({
            foo: 'bar',
          }),
        }),
      });
    });
  });

  describe('browser compatibility', () => {
    it('should work when localStorage is not available', () => {
      const originalLocalStorage = global.localStorage;
      delete (global as any).localStorage;

      const selectStorageSpy = vi.spyOn(storageModule, 'selectStorage');

      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
        persistence: 'localStorage',
        trackingConsent: 'granted',
      });

      expect(selectStorageSpy).toHaveBeenCalledWith('localStorage', {
        onFallback: expect.any(Function),
      });

      global.localStorage = originalLocalStorage;
    });

    it('should work when sendBeacon is not available', () => {
      setupBeaconUnavailable();

      altertable.init(apiKey, {
        baseUrl: 'http://localhost',
        autoCapture: false,
        trackingConsent: 'granted',
      });

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track', {
        method: 'fetch',
        payload: expect.objectContaining({
          event: 'test-event',
          properties: expect.objectContaining({
            foo: 'bar',
          }),
        }),
      });
    });

    it('should work in SSR environments', () => {
      const originalWindow = global.window;
      delete (global as any).window;

      expect(() => {
        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        });
      }).not.toThrow();

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track');

      global.window = originalWindow;
    });

    it('should handle missing navigator gracefully', () => {
      const originalNavigator = global.navigator;
      delete (global as any).navigator;

      expect(() => {
        altertable.init(apiKey, {
          baseUrl: 'http://localhost',
          autoCapture: false,
          trackingConsent: 'granted',
        });
      }).not.toThrow();

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track');

      global.navigator = originalNavigator;
    });
  });

  describe('configuration validation', () => {
    it('should handle custom environment values gracefully', () => {
      setupAltertable({ environment: 'custom-env' });

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track', {
        payload: expect.objectContaining({
          event: 'test-event',
          environment: 'custom-env',
          properties: expect.objectContaining({
            foo: 'bar',
          }),
        }),
      });
    });

    it('should handle malformed URLs gracefully', () => {
      expect(() => {
        setupAltertable({ baseUrl: 'not-a-valid-url' });
      }).not.toThrow();

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track');
    });

    it('should handle empty baseUrl gracefully', () => {
      expect(() => {
        setupAltertable({ baseUrl: '' });
      }).not.toThrow();

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track');
    });
  });

  describe('network method selection', () => {
    it('uses beacon when available', () => {
      setupBeaconAvailable();

      setupAltertable();

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track', {
        method: 'beacon',
        payload: expect.objectContaining({
          event: 'test-event',
          properties: expect.objectContaining({
            foo: 'bar',
          }),
        }),
      });
    });

    it('falls back to fetch when beacon is unavailable', () => {
      setupBeaconUnavailable();

      setupAltertable();

      expect(() => {
        altertable.track('test-event', { foo: 'bar' });
      }).toRequestApi('/track', {
        method: 'fetch',
        payload: expect.objectContaining({
          event: 'test-event',
          properties: expect.objectContaining({
            foo: 'bar',
          }),
        }),
      });
    });
  });

  describe('network failure handling', () => {
    it('handles network failures gracefully', () => {
      setupAltertable();

      const errorSpy = vi.spyOn(altertable['_logger'], 'error');

      const originalSend = altertable['_requester'].send;
      altertable['_requester'].send = vi.fn().mockImplementation(() => {
        throw new Error('Network error');
      });

      altertable.track('test-event', { foo: 'bar' });

      expect(errorSpy).toHaveBeenCalledWith('Failed to send event', {
        error: expect.any(Error),
        eventType: 'track',
        payload: expect.objectContaining({
          event: 'test-event',
        }),
      });

      altertable['_requester'].send = originalSend;
    });

    it('continues to function after network failures', () => {
      setupAltertable();

      const errorSpy = vi.spyOn(altertable['_logger'], 'error');

      const originalSend = altertable['_requester'].send;
      altertable['_requester'].send = vi.fn().mockImplementation(() => {
        throw new Error('Network error');
      });

      expect(() => {
        altertable.track('test-event-1', { foo: 'bar' });
        altertable.track('test-event-2', { baz: 'qux' });
      }).not.toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(2);

      altertable['_requester'].send = originalSend;
    });

    it('shows helpful warning for environment-not-found error', () => {
      setupAltertable({ environment: 'staging' });

      const warnDevSpy = vi.spyOn(altertable['_logger'], 'warnDev');
      const errorSpy = vi.spyOn(altertable['_logger'], 'error');

      const originalSend = altertable['_requester'].send;
      altertable['_requester'].send = vi.fn().mockImplementation(() => {
        throw new ApiError(400, 'Bad Request', 'environment-not-found', {
          error_code: 'environment-not-found',
        });
      });

      altertable.track('test-event', { foo: 'bar' });

      expect(warnDevSpy).toHaveBeenCalledTimes(1);
      expect(warnDevSpy.mock.calls[0][0]).toMatchInlineSnapshot(
        `"Environment "staging" not found. Please create this environment in your Altertable dashboard at https://altertable.ai/dashboard/environments/new?name=staging before tracking events."`
      );
      expect(errorSpy).not.toHaveBeenCalled();

      altertable['_requester'].send = originalSend;
    });

    it('shows helpful warning for environment-not-found error with default environment', () => {
      setupAltertable(); // Uses default 'production' environment

      const warnDevSpy = vi.spyOn(altertable['_logger'], 'warnDev');
      const errorSpy = vi.spyOn(altertable['_logger'], 'error');

      const originalSend = altertable['_requester'].send;
      altertable['_requester'].send = vi.fn().mockImplementation(() => {
        throw new ApiError(400, 'Bad Request', 'environment-not-found', {
          error_code: 'environment-not-found',
        });
      });

      altertable.track('test-event', { foo: 'bar' });

      expect(warnDevSpy).toHaveBeenCalledTimes(1);
      expect(warnDevSpy.mock.calls[0][0]).toMatchInlineSnapshot(
        `"Environment "production" not found. Please create this environment in your Altertable dashboard at https://altertable.ai/dashboard/environments/new?name=production before tracking events."`
      );
      expect(errorSpy).not.toHaveBeenCalled();

      altertable['_requester'].send = originalSend;
    });

    it('uses generic error handling for other ApiErrors', () => {
      setupAltertable();

      const warnDevSpy = vi.spyOn(altertable['_logger'], 'warnDev');
      const errorSpy = vi.spyOn(altertable['_logger'], 'error');

      const originalSend = altertable['_requester'].send;
      altertable['_requester'].send = vi.fn().mockImplementation(() => {
        throw new ApiError(429, 'Too Many Requests', 'rate-limit-exceeded', {
          error_code: 'rate-limit-exceeded',
        });
      });

      altertable.track('test-event', { foo: 'bar' });

      expect(warnDevSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('Failed to send event', {
        error: expect.any(ApiError),
        eventType: 'track',
        payload: expect.objectContaining({
          event: 'test-event',
        }),
      });

      altertable['_requester'].send = originalSend;
    });

    it('handles environment-not-found error for identify events', () => {
      setupAltertable({ environment: 'development' });

      const warnDevSpy = vi.spyOn(altertable['_logger'], 'warnDev');
      const errorSpy = vi.spyOn(altertable['_logger'], 'error');

      const originalSend = altertable['_requester'].send;
      altertable['_requester'].send = vi.fn().mockImplementation(() => {
        throw new ApiError(400, 'Bad Request', 'environment-not-found', {
          error_code: 'environment-not-found',
        });
      });

      altertable.identify('user123', { email: 'user@example.com' });

      expect(warnDevSpy).toHaveBeenCalledTimes(1);
      expect(warnDevSpy.mock.calls[0][0]).toMatchInlineSnapshot(
        `"Environment "development" not found. Please create this environment in your Altertable dashboard at https://altertable.ai/dashboard/environments/new?name=development before tracking events."`
      );
      expect(errorSpy).not.toHaveBeenCalled();

      altertable['_requester'].send = originalSend;
    });

    it('calls onError handler when provided', () => {
      const onErrorSpy = vi.fn();
      setupAltertable({ onError: onErrorSpy });

      const originalSend = altertable['_requester'].send;
      const testError = new ApiError(
        500,
        'Internal Server Error',
        undefined,
        undefined
      );
      altertable['_requester'].send = vi.fn().mockImplementation(() => {
        throw testError;
      });

      altertable.track('test-event', { foo: 'bar' });

      expect(onErrorSpy).toHaveBeenCalledTimes(1);
      expect(onErrorSpy).toHaveBeenCalledWith(testError);

      altertable['_requester'].send = originalSend;
    });

    it('calls onError handler for NetworkError', () => {
      const onErrorSpy = vi.fn();
      setupAltertable({ onError: onErrorSpy });

      const originalSend = altertable['_requester'].send;
      const testError = new NetworkError('Network connection failed');
      altertable['_requester'].send = vi.fn().mockImplementation(() => {
        throw testError;
      });

      altertable.track('test-event', { foo: 'bar' });

      expect(onErrorSpy).toHaveBeenCalledTimes(1);
      expect(onErrorSpy).toHaveBeenCalledWith(testError);

      altertable['_requester'].send = originalSend;
    });

    it('handles NetworkError with specific error message', () => {
      setupAltertable();

      const errorSpy = vi.spyOn(altertable['_logger'], 'error');

      const originalSend = altertable['_requester'].send;
      const testError = new NetworkError(
        'Connection timeout',
        new Error('Timeout')
      );
      altertable['_requester'].send = vi.fn().mockImplementation(() => {
        throw testError;
      });

      altertable.track('test-event', { foo: 'bar' });

      expect(errorSpy).toHaveBeenCalledWith(
        'Network error while sending event',
        {
          error: 'Connection timeout',
          cause: expect.any(Error),
          eventType: 'track',
        }
      );

      altertable['_requester'].send = originalSend;
    });
  });
});
