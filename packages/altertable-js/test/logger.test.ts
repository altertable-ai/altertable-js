import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger, loggerCache } from '../src/lib/logger';
import type {
  AliasPayload,
  EventPayload,
  IdentifyPayload,
  TrackPayload,
} from '../src/types';

describe('Logger', () => {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    groupCollapsed: console.groupCollapsed,
    groupEnd: console.groupEnd,
    table: console.table,
  };

  beforeEach(() => {
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    console.groupCollapsed = vi.fn();
    console.groupEnd = vi.fn();
    console.table = vi.fn();

    loggerCache.current = {};
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

  describe('log', () => {
    it('logs with prefix', () => {
      const logger = createLogger('TestLogger');
      const message = 'Hello world';

      logger.log(message);

      expect(console.log).toHaveBeenCalledWith('[TestLogger]', message);
    });

    it('logs multiple arguments', () => {
      const logger = createLogger('TestLogger');
      const arg1 = 'Hello';
      const arg2 = { key: 'value' };
      const arg3 = 42;

      logger.log(arg1, arg2, arg3);

      expect(console.log).toHaveBeenCalledWith(
        '[TestLogger]',
        arg1,
        arg2,
        arg3
      );
    });
  });

  describe('logHeader', () => {
    it('logs header with version and debug mode', () => {
      const logger = createLogger('TestLogger');

      logger.logHeader();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(/Altertable v.* %c• Debug mode enabled/),
        expect.any(String)
      );
    });

    it('only logs header once', () => {
      const logger = createLogger('TestLogger');

      logger.logHeader();
      logger.logHeader();

      expect(console.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('logEvent', () => {
    const mockEventPayload: TrackPayload = {
      timestamp: '2021-01-01T00:00:00.000Z',
      event: 'test_event',
      device_id: 'device-123',
      distinct_id: 'user123',
      session_id: 'session-123',
      anonymous_id: 'visitor-123',
      environment: 'development',
      properties: {
        key1: 'value1',
        key2: 42,
        key3: { nested: 'object' },
      },
    };

    it('logs event with all components', () => {
      const logger = createLogger('TestLogger');

      logger.logEvent(mockEventPayload, { trackingConsent: 'granted' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cTrack%c test_event %c\[development\] %c\d{2}:\d{2}:\d{2} %c/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('logs user information', () => {
      const logger = createLogger('TestLogger');

      logger.logEvent(mockEventPayload, { trackingConsent: 'granted' });

      expect(console.log).toHaveBeenCalledWith(
        '%cUser ID %cuser123',
        expect.any(String),
        expect.any(String)
      );
    });

    it('handles undefined user_id', () => {
      const logger = createLogger('TestLogger');
      const payloadWithoutUser: TrackPayload = {
        ...mockEventPayload,
        distinct_id: undefined,
      };

      logger.logEvent(payloadWithoutUser, { trackingConsent: 'granted' });

      expect(console.log).toHaveBeenCalledWith(
        '%cUser ID %cNot set',
        expect.any(String),
        expect.any(String)
      );
    });

    it('logs visitor information', () => {
      const logger = createLogger('TestLogger');

      logger.logEvent(mockEventPayload, { trackingConsent: 'granted' });

      expect(console.log).toHaveBeenCalledWith(
        '%cVisitor ID %cvisitor-123',
        expect.any(String),
        expect.any(String)
      );
    });

    it('handles undefined visitor_id', () => {
      const logger = createLogger('TestLogger');
      const payloadWithoutVisitor: TrackPayload = {
        ...mockEventPayload,
        anonymous_id: undefined,
      };

      logger.logEvent(payloadWithoutVisitor, { trackingConsent: 'granted' });

      expect(console.log).toHaveBeenCalledWith(
        '%cVisitor ID %cNot set',
        expect.any(String),
        expect.any(String)
      );
    });

    it('logs session information', () => {
      const logger = createLogger('TestLogger');

      logger.logEvent(mockEventPayload, { trackingConsent: 'granted' });

      expect(console.log).toHaveBeenCalledWith(
        '%cSession ID %csession-123',
        expect.any(String),
        expect.any(String)
      );
    });

    it('handles undefined session_id', () => {
      const logger = createLogger('TestLogger');
      const payloadWithoutSession: EventPayload = {
        ...mockEventPayload,
        session_id: undefined,
      };

      logger.logEvent(payloadWithoutSession, { trackingConsent: 'granted' });

      expect(console.log).toHaveBeenCalledWith(
        '%cSession ID %cNot set',
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays no badge when tracking consent is granted', () => {
      const logger = createLogger('TestLogger');

      logger.logEvent(mockEventPayload, { trackingConsent: 'granted' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cTrack%c test_event %c\[development\] %c\d{2}:\d{2}:\d{2} %c$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays DENIED badge when tracking consent is denied', () => {
      const logger = createLogger('TestLogger');

      logger.logEvent(mockEventPayload, { trackingConsent: 'denied' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cTrack%c test_event %c\[development\] %c\d{2}:\d{2}:\d{2} %cDENIED$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays PENDING badge when tracking consent is pending', () => {
      const logger = createLogger('TestLogger');

      logger.logEvent(mockEventPayload, { trackingConsent: 'pending' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cTrack%c test_event %c\[development\] %c\d{2}:\d{2}:\d{2} %cPENDING$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays PENDING badge when tracking consent is dismissed', () => {
      const logger = createLogger('TestLogger');

      logger.logEvent(mockEventPayload, { trackingConsent: 'dismissed' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cTrack%c test_event %c\[development\] %c\d{2}:\d{2}:\d{2} %cPENDING$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays UNKNOWN badge for unknown tracking consent values', () => {
      const logger = createLogger('TestLogger');

      logger.logEvent(mockEventPayload, { trackingConsent: 'unknown' as any });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cTrack%c test_event %c\[development\] %c\d{2}:\d{2}:\d{2} %cUNKNOWN$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('logs pageview event with Page badge and URL as title', () => {
      const logger = createLogger('TestLogger');
      const pageviewPayload: EventPayload = {
        ...mockEventPayload,
        event: '$pageview',
        properties: {
          ...mockEventPayload.properties,
          $url: 'https://example.com/test-page',
        },
      };

      logger.logEvent(pageviewPayload, { trackingConsent: 'granted' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cPage%c https:\/\/example\.com\/test-page %c\[development\] %c\d{2}:\d{2}:\d{2} %c/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('logIdentify', () => {
    const mockIdentifyPayload: IdentifyPayload = {
      environment: 'development',
      traits: {
        email: 'test@example.com',
        name: 'Test User',
        age: 25,
      },
      device_id: 'device-123',
      distinct_id: 'user123',
      anonymous_id: 'visitor-123' as const,
    };

    it('logs identify event with all components', () => {
      const logger = createLogger('TestLogger');

      logger.logIdentify(mockIdentifyPayload, { trackingConsent: 'granted' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cIdentify%c user123 %c\[development\] %c$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('logs user information', () => {
      const logger = createLogger('TestLogger');

      logger.logIdentify(mockIdentifyPayload, { trackingConsent: 'granted' });

      expect(console.log).toHaveBeenCalledWith(
        '%cDistinct ID %cuser123',
        expect.any(String),
        expect.any(String)
      );
    });

    it('handles undefined distinct_id', () => {
      const logger = createLogger('TestLogger');
      const payloadWithoutDistinctId: IdentifyPayload = {
        ...mockIdentifyPayload,
        distinct_id: undefined,
      };

      logger.logIdentify(payloadWithoutDistinctId, {
        trackingConsent: 'granted',
      });

      expect(console.log).toHaveBeenCalledWith(
        '%cDistinct ID %cNot set',
        expect.any(String),
        expect.any(String)
      );
    });

    it('logs visitor information', () => {
      const logger = createLogger('TestLogger');

      logger.logIdentify(mockIdentifyPayload, { trackingConsent: 'granted' });

      expect(console.log).toHaveBeenCalledWith(
        '%cAnonymous ID %cvisitor-123',
        expect.any(String),
        expect.any(String)
      );
    });

    it('handles undefined anonymous_id', () => {
      const logger = createLogger('TestLogger');
      const payloadWithoutAnonymousId: IdentifyPayload = {
        ...mockIdentifyPayload,
        anonymous_id: undefined,
      };

      logger.logIdentify(payloadWithoutAnonymousId, {
        trackingConsent: 'granted',
      });

      expect(console.log).toHaveBeenCalledWith(
        '%cAnonymous ID %cNot set',
        expect.any(String),
        expect.any(String)
      );
    });

    it('logs traits table', () => {
      const logger = createLogger('TestLogger');

      logger.logIdentify(mockIdentifyPayload, { trackingConsent: 'granted' });

      expect(console.table).toHaveBeenCalledWith(mockIdentifyPayload.traits);
    });

    it('displays no badge when tracking consent is granted', () => {
      const logger = createLogger('TestLogger');

      logger.logIdentify(mockIdentifyPayload, { trackingConsent: 'granted' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cIdentify%c user123 %c\[development\] %c$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays DENIED badge when tracking consent is denied', () => {
      const logger = createLogger('TestLogger');

      logger.logIdentify(mockIdentifyPayload, { trackingConsent: 'denied' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cIdentify%c user123 %c\[development\] %cDENIED$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays PENDING badge when tracking consent is pending', () => {
      const logger = createLogger('TestLogger');

      logger.logIdentify(mockIdentifyPayload, { trackingConsent: 'pending' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cIdentify%c user123 %c\[development\] %cPENDING$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('logAlias', () => {
    const mockAliasPayload: AliasPayload = {
      environment: 'development',
      new_user_id: 'user--456',
      device_id: 'device-123',
      distinct_id: 'user123',
      anonymous_id: 'visitor-123' as const,
    };

    it('logs alias event with all components', () => {
      const logger = createLogger('TestLogger');

      logger.logAlias(mockAliasPayload, { trackingConsent: 'granted' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cAlias%c user123 %c\[development\] %c$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('logs distinct ID information', () => {
      const logger = createLogger('TestLogger');

      logger.logAlias(mockAliasPayload, { trackingConsent: 'granted' });

      expect(console.log).toHaveBeenCalledWith(
        '%cDistinct ID %cuser123',
        expect.any(String),
        expect.any(String)
      );
    });

    it('handles undefined distinct_id', () => {
      const logger = createLogger('TestLogger');
      const payloadWithoutDistinctId: AliasPayload = {
        ...mockAliasPayload,
        distinct_id: undefined,
      };

      logger.logAlias(payloadWithoutDistinctId, {
        trackingConsent: 'granted',
      });

      expect(console.log).toHaveBeenCalledWith(
        '%cDistinct ID %cNot set',
        expect.any(String),
        expect.any(String)
      );
    });

    it('handles undefined new_user_id', () => {
      const logger = createLogger('TestLogger');
      const payloadWithoutAnonymousId: AliasPayload = {
        ...mockAliasPayload,
        new_user_id: undefined,
      };

      logger.logAlias(payloadWithoutAnonymousId, {
        trackingConsent: 'granted',
      });

      expect(console.log).toHaveBeenCalledWith(
        '%cNew User ID %cNot set',
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays no badge when tracking consent is granted', () => {
      const logger = createLogger('TestLogger');

      logger.logAlias(mockAliasPayload, { trackingConsent: 'granted' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cAlias%c user123 %c\[development\] %c$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays DENIED badge when tracking consent is denied', () => {
      const logger = createLogger('TestLogger');

      logger.logAlias(mockAliasPayload, { trackingConsent: 'denied' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cAlias%c user123 %c\[development\] %cDENIED$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('displays PENDING badge when tracking consent is pending', () => {
      const logger = createLogger('TestLogger');

      logger.logAlias(mockAliasPayload, { trackingConsent: 'pending' });

      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[TestLogger\] %cAlias%c user123 %c\[development\] %cPENDING$/
        ),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('warn', () => {
    it('warns with prefix', () => {
      const logger = createLogger('TestLogger');
      const message = 'Warning message';

      logger.warn(message);

      expect(console.warn).toHaveBeenCalledWith('[TestLogger]', message);
    });

    it('warns multiple arguments', () => {
      const logger = createLogger('TestLogger');
      const arg1 = 'Warning';
      const arg2 = { error: 'details' };

      logger.warn(arg1, arg2);

      expect(console.warn).toHaveBeenCalledWith('[TestLogger]', arg1, arg2);
    });
  });

  describe('error', () => {
    it('errors with prefix', () => {
      const logger = createLogger('TestLogger');
      const message = 'Error message';

      logger.error(message);

      expect(console.error).toHaveBeenCalledWith('[TestLogger]', message);
    });

    it('errors multiple arguments', () => {
      const logger = createLogger('TestLogger');
      const arg1 = 'Error';
      const arg2 = new Error('Something went wrong');

      logger.error(arg1, arg2);

      expect(console.error).toHaveBeenCalledWith('[TestLogger]', arg1, arg2);
    });
  });

  describe('warnDev', () => {
    it('warns in development mode', () => {
      const logger = createLogger('TestLogger');
      const message = 'Development warning';

      expect(() => {
        logger.warnDev(message);
      }).toWarnDev('[TestLogger] Development warning');
    });

    it('trims whitespace from message', () => {
      const logger = createLogger('TestLogger');
      const message = '  Development warning  ';

      expect(() => {
        logger.warnDev(message);
      }).toWarnDev('[TestLogger] Development warning');
    });

    it('passes additional arguments', () => {
      const logger = createLogger('TestLogger');
      const message = 'Development warning';
      const additionalArg = { debug: 'info' };

      logger.warnDev(message, additionalArg);

      expect(console.warn).toHaveBeenCalledWith(
        '[TestLogger] Development warning',
        additionalArg
      );
    });

    it('does not warn the same message twice', () => {
      const logger = createLogger('TestLogger');
      const message = 'Development warning';

      expect(() => {
        logger.warnDev(message);
      }).toWarnDev('[TestLogger] Development warning');

      expect(() => {
        logger.warnDev(message);
      }).not.toWarnDev('[TestLogger] Development warning');
    });

    it('warns different messages separately', () => {
      const logger = createLogger('TestLogger');
      const message1 = 'First warning';
      const message2 = 'Second warning';

      expect(() => {
        logger.warnDev(message1);
      }).toWarnDev('[TestLogger] First warning');
      expect(() => {
        logger.warnDev(message2);
      }).toWarnDev('[TestLogger] Second warning');
    });

    it('caches messages with trimmed content', () => {
      const logger = createLogger('TestLogger');
      const message1 = 'Development warning';
      const message2 = '  Development warning  ';

      expect(() => {
        logger.warnDev(message1);
      }).toWarnDev('[TestLogger] Development warning');
      expect(() => {
        logger.warnDev(message2);
      }).not.toWarnDev('[TestLogger] Development warning');
    });
  });

  describe('loggerCache', () => {
    it('is shared across logger instances', () => {
      const logger1 = createLogger('Logger1');
      const logger2 = createLogger('Logger2');
      const message = 'Shared warning';

      expect(() => {
        logger1.warnDev(message);
      }).toWarnDev('[Logger1] Shared warning');
      expect(() => {
        logger2.warnDev(message);
      }).not.toWarnDev('[Logger2] Shared warning');
    });
  });
});
