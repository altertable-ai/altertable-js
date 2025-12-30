import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createStorageMock,
  StorageMock,
} from '../../../test-utils/mocks/storageMock';
import {
  PREFIX_ANONYMOUS_ID,
  PREFIX_DEVICE_ID,
  PREFIX_SESSION_ID,
  SESSION_EXPIRATION_TIME_MS,
  TrackingConsent,
} from '../src/constants';
import { createLogger } from '../src/lib/logger';
import { SessionManager } from '../src/lib/sessionManager';

describe('SessionManager with tracking consent', () => {
  let mockStorage: StorageMock;
  let mockLogger: ReturnType<typeof createLogger>;
  let sessionManager: SessionManager;
  const testStorageKey = 'test-storage-key';

  beforeEach(() => {
    mockStorage = createStorageMock();
    mockLogger = createLogger('test');
  });

  describe('tracking consent initialization', () => {
    it('should initialize with default pending consent when not provided', () => {
      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.PENDING);
    });

    it('should initialize with provided default consent', () => {
      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.GRANTED,
      });
      sessionManager.init();

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);
    });

    it('should load consent from storage if valid', () => {
      mockStorage.getItem.mockReturnValue(
        JSON.stringify({
          deviceId: 'device-test-1',
          distinctId: 'anonymous-test-1',
          anonymousId: null,
          sessionId: 'session-test-1',
          lastEventAt: null,
          trackingConsent: TrackingConsent.DENIED,
        })
      );

      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.DENIED);
    });

    it('should fall back to default consent if stored consent is invalid', () => {
      mockStorage.getItem.mockReturnValue(
        JSON.stringify({
          deviceId: 'device-test-1',
          distinctId: 'anonymous-test-1',
          anonymousId: null,
          sessionId: 'session-test-1',
          lastEventAt: null,
          trackingConsent: 'invalid-consent',
        })
      );

      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.GRANTED,
      });
      sessionManager.init();

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);
    });
  });

  describe('tracking consent management', () => {
    beforeEach(() => {
      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();
    });

    it('should set and persist tracking consent', () => {
      sessionManager.setTrackingConsent(TrackingConsent.GRANTED);

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        testStorageKey,
        expect.stringContaining('"trackingConsent":"granted"')
      );
    });

    it('should reset tracking consent to default when resetTrackingConsent is true', () => {
      sessionManager.setTrackingConsent(TrackingConsent.GRANTED);
      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);

      sessionManager.reset({ resetTrackingConsent: true });
      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.PENDING);
    });

    it('should not reset tracking consent when resetTrackingConsent is false', () => {
      sessionManager.setTrackingConsent(TrackingConsent.GRANTED);
      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);

      sessionManager.reset({ resetTrackingConsent: false });
      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);
    });

    it('should persist tracking consent changes to storage', () => {
      sessionManager.setTrackingConsent(TrackingConsent.GRANTED);
      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        testStorageKey,
        expect.stringContaining('"trackingConsent":"granted"')
      );

      sessionManager.setTrackingConsent(TrackingConsent.DENIED);
      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.DENIED);
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        testStorageKey,
        expect.stringContaining('"trackingConsent":"denied"')
      );
    });

    it('should handle tracking consent in session data recovery', () => {
      const storedData = JSON.stringify({
        deviceId: 'device-test-1',
        anonymousId: 'anonymous-test-1',
        sessionId: 'session-test-1',
        distinctId: 'user123',
        lastEventAt: '2023-01-01T00:00:00.000Z',
        trackingConsent: TrackingConsent.DENIED,
      });

      mockStorage.getItem.mockReturnValue(storedData);

      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.DENIED);
      expect(sessionManager.getDistinctId()).toBe('user123');
    });
  });

  describe('tracking consent validation', () => {
    it('should handle missing tracking consent in stored data', () => {
      const storedData = JSON.stringify({
        deviceId: 'device-test-1',
        distinctId: 'anonymous-test-1',
        anonymousId: null,
        sessionId: 'session-test-1',
        lastEventAt: null,
        // trackingConsent is missing
      });

      mockStorage.getItem.mockReturnValue(storedData);

      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.GRANTED,
      });
      sessionManager.init();

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);
    });

    it('should handle null tracking consent in stored data', () => {
      const storedData = JSON.stringify({
        deviceId: 'device-test-1',
        distinctId: 'anonymous-test-1',
        anonymousId: null,
        sessionId: 'session-test-1',
        lastEventAt: null,
        trackingConsent: null,
      });

      mockStorage.getItem.mockReturnValue(storedData);

      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.PENDING);
    });

    it('should handle undefined tracking consent in stored data', () => {
      const storedData = JSON.stringify({
        deviceId: 'device-test-1',
        distinctId: 'anonymous-test-1',
        anonymousId: null,
        sessionId: 'session-test-1',
        lastEventAt: null,
        trackingConsent: undefined,
      });

      mockStorage.getItem.mockReturnValue(storedData);

      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.DENIED,
      });
      sessionManager.init();

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.DENIED);
    });
  });

  describe('isIdentified', () => {
    describe('initial state', () => {
      it('should return false for a fresh session manager (anonymous state)', () => {
        sessionManager = new SessionManager({
          storage: mockStorage,
          storageKey: testStorageKey,
          logger: mockLogger,
          defaultTrackingConsent: TrackingConsent.PENDING,
        });
        sessionManager.init();

        expect(sessionManager.isIdentified()).toBe(false);
        expect(sessionManager.getAnonymousId()).toBe(null);
        // distinctId should be a anonymous ID when anonymous
        const anonymousId = sessionManager.getDistinctId();
        expect(anonymousId).toMatch(PREFIX_ANONYMOUS_ID);
      });
    });

    describe('loading from storage', () => {
      it('should return false when anonymousId is null (anonymous state)', () => {
        const storedData = JSON.stringify({
          deviceId: 'device-test-1',
          distinctId: 'anonymous-test-1', // anonymous ID when anonymous
          anonymousId: null,
          sessionId: 'session-test-1',
          lastEventAt: null,
          trackingConsent: TrackingConsent.PENDING,
        });

        mockStorage.getItem.mockReturnValue(storedData);

        sessionManager = new SessionManager({
          storage: mockStorage,
          storageKey: testStorageKey,
          logger: mockLogger,
          defaultTrackingConsent: TrackingConsent.PENDING,
        });
        sessionManager.init();

        expect(sessionManager.isIdentified()).toBe(false);
        expect(sessionManager.getAnonymousId()).toBe(null);
        expect(sessionManager.getDistinctId()).toBe('anonymous-test-1');
      });

      it('should return true when anonymousId is set (identified state)', () => {
        const storedData = JSON.stringify({
          deviceId: 'device-test-1',
          distinctId: 'user123', // user ID after identification
          anonymousId: 'anonymous-test-1', // previous anonymous ID
          sessionId: 'session-test-1',
          lastEventAt: null,
          trackingConsent: TrackingConsent.PENDING,
        });

        mockStorage.getItem.mockReturnValue(storedData);

        sessionManager = new SessionManager({
          storage: mockStorage,
          storageKey: testStorageKey,
          logger: mockLogger,
          defaultTrackingConsent: TrackingConsent.PENDING,
        });
        sessionManager.init();

        expect(sessionManager.isIdentified()).toBe(true);
        expect(sessionManager.getAnonymousId()).toBe('anonymous-test-1');
        expect(sessionManager.getDistinctId()).toBe('user123');
      });

      it('should return false when anonymousId is missing from stored data', () => {
        const storedData = JSON.stringify({
          deviceId: 'device-test-1',
          distinctId: 'anonymous-test-1',
          sessionId: 'session-test-1',
          lastEventAt: null,
          trackingConsent: TrackingConsent.PENDING,
        });

        mockStorage.getItem.mockReturnValue(storedData);

        sessionManager = new SessionManager({
          storage: mockStorage,
          storageKey: testStorageKey,
          logger: mockLogger,
          defaultTrackingConsent: TrackingConsent.PENDING,
        });
        sessionManager.init();

        expect(sessionManager.isIdentified()).toBe(false);
        expect(sessionManager.getAnonymousId()).toBe(null);
      });
    });

    describe('state transition via identify()', () => {
      beforeEach(() => {
        sessionManager = new SessionManager({
          storage: mockStorage,
          storageKey: testStorageKey,
          logger: mockLogger,
          defaultTrackingConsent: TrackingConsent.PENDING,
        });
        sessionManager.init();
      });

      it('should transition from anonymous to identified when identify() is called', () => {
        // Initially anonymous
        expect(sessionManager.isIdentified()).toBe(false);
        expect(sessionManager.getAnonymousId()).toBe(null);
        const initialDistinctId = sessionManager.getDistinctId();
        expect(initialDistinctId).toMatch(PREFIX_ANONYMOUS_ID);

        // Identify the user
        sessionManager.identify('user123');

        // Now identified: anonymousId stores the previous anonymous ID
        expect(sessionManager.isIdentified()).toBe(true);
        expect(sessionManager.getAnonymousId()).toBe(initialDistinctId);
        expect(sessionManager.getDistinctId()).toBe('user123');
        expect(mockStorage.setItem).toHaveBeenCalled();
      });
    });
  });

  describe('initialization', () => {
    it('should generate IDs when no storage data exists', () => {
      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();

      expect(sessionManager.getSessionId()).toMatch(PREFIX_SESSION_ID);
      expect(sessionManager.getDeviceId()).toMatch(PREFIX_DEVICE_ID);
      expect(sessionManager.getDistinctId()).toMatch(PREFIX_ANONYMOUS_ID);
      expect(sessionManager.getAnonymousId()).toBe(null);
      expect(sessionManager.getLastEventAt()).toBe(null);
      expect(mockStorage.setItem).toHaveBeenCalled();
    });

    it('should load data from storage when available', () => {
      const storedData = JSON.stringify({
        deviceId: 'device-test-1',
        distinctId: 'anonymous-test-1',
        anonymousId: null,
        sessionId: 'session-test-1',
        lastEventAt: '2023-01-01T00:00:00.000Z',
        trackingConsent: TrackingConsent.GRANTED,
      });

      mockStorage.getItem.mockReturnValue(storedData);

      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();

      expect(sessionManager.getDeviceId()).toBe('device-test-1');
      expect(sessionManager.getDistinctId()).toBe('anonymous-test-1');
      expect(sessionManager.getSessionId()).toBe('session-test-1');
      expect(sessionManager.getLastEventAt()).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should handle JSON parse errors gracefully', () => {
      mockStorage.getItem.mockReturnValue('invalid-json');
      const warnSpy = vi.spyOn(mockLogger, 'warnDev');

      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();

      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to parse storage data. Resetting session data.'
      );
      expect(sessionManager.getSessionId()).toMatch(PREFIX_SESSION_ID);
      expect(sessionManager.getDeviceId()).toMatch(PREFIX_DEVICE_ID);
    });

    it('should generate missing IDs when partial data exists', () => {
      const storedData = JSON.stringify({
        distinctId: 'anonymous-test-1',
        // deviceId and sessionId are missing
      });

      mockStorage.getItem.mockReturnValue(storedData);

      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();

      expect(sessionManager.getDistinctId()).toBe('anonymous-test-1');
      expect(sessionManager.getDeviceId()).toMatch(PREFIX_DEVICE_ID);
      expect(sessionManager.getSessionId()).toMatch(PREFIX_SESSION_ID);
    });
  });

  describe('getters', () => {
    beforeEach(() => {
      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();
    });

    it('should return session ID', () => {
      const sessionId = sessionManager.getSessionId();
      expect(sessionId).toMatch(PREFIX_SESSION_ID);
      expect(typeof sessionId).toBe('string');
    });

    it('should return device ID', () => {
      const deviceId = sessionManager.getDeviceId();
      expect(deviceId).toMatch(PREFIX_DEVICE_ID);
      expect(typeof deviceId).toBe('string');
    });

    it('should return distinct ID', () => {
      const distinctId = sessionManager.getDistinctId();
      expect(distinctId).toMatch(PREFIX_ANONYMOUS_ID);
      expect(typeof distinctId).toBe('string');
    });

    it('should return anonymous ID', () => {
      expect(sessionManager.getAnonymousId()).toBe(null);

      sessionManager.identify('user123');
      const anonymousId = sessionManager.getAnonymousId();
      expect(anonymousId).toMatch(PREFIX_ANONYMOUS_ID);
    });

    it('should return last event timestamp', () => {
      expect(sessionManager.getLastEventAt()).toBe(null);

      const timestamp = '2023-01-01T00:00:00.000Z';
      sessionManager.updateLastEventAt(timestamp);
      expect(sessionManager.getLastEventAt()).toBe(timestamp);
    });
  });

  describe('updateLastEventAt', () => {
    beforeEach(() => {
      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();
    });

    it('should update and persist last event timestamp', () => {
      const timestamp = '2023-01-01T00:00:00.000Z';
      sessionManager.updateLastEventAt(timestamp);

      expect(sessionManager.getLastEventAt()).toBe(timestamp);
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        testStorageKey,
        expect.stringContaining(`"lastEventAt":"${timestamp}"`)
      );
    });
  });

  describe('renewSessionIfNeeded', () => {
    beforeEach(() => {
      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();
    });

    it('should renew session when lastEventAt is null', () => {
      const initialSessionId = sessionManager.getSessionId();
      const renewed = sessionManager.renewSessionIfNeeded();

      expect(renewed).toBe(true);
      expect(sessionManager.getSessionId()).not.toBe(initialSessionId);
      expect(sessionManager.getLastEventAt()).toBe(null);
    });

    it('should renew session when lastEventAt exceeds expiration time', () => {
      vi.useFakeTimers();
      const expiredTimestamp = new Date(
        Date.now() - SESSION_EXPIRATION_TIME_MS - 1000
      ).toISOString();

      sessionManager.updateLastEventAt(expiredTimestamp);
      const initialSessionId = sessionManager.getSessionId();

      const renewed = sessionManager.renewSessionIfNeeded();

      expect(renewed).toBe(true);
      expect(sessionManager.getSessionId()).not.toBe(initialSessionId);
      expect(sessionManager.getLastEventAt()).toBe(null);
      vi.useRealTimers();
    });

    it('should not renew session when lastEventAt is within expiration time', () => {
      vi.useFakeTimers();
      const recentTimestamp = new Date(
        Date.now() - SESSION_EXPIRATION_TIME_MS + 1000
      ).toISOString();

      sessionManager.updateLastEventAt(recentTimestamp);
      const initialSessionId = sessionManager.getSessionId();

      const renewed = sessionManager.renewSessionIfNeeded();

      expect(renewed).toBe(false);
      expect(sessionManager.getSessionId()).toBe(initialSessionId);
      expect(sessionManager.getLastEventAt()).toBe(recentTimestamp);
      vi.useRealTimers();
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      sessionManager = new SessionManager({
        storage: mockStorage,
        storageKey: testStorageKey,
        logger: mockLogger,
        defaultTrackingConsent: TrackingConsent.PENDING,
      });
      sessionManager.init();
    });

    it('should reset all session data to default state', () => {
      sessionManager.identify('user123');
      sessionManager.updateLastEventAt('2023-01-01T00:00:00.000Z');
      const initialSessionId = sessionManager.getSessionId();
      const initialDeviceId = sessionManager.getDeviceId();

      sessionManager.reset();

      expect(sessionManager.isIdentified()).toBe(false);
      expect(sessionManager.getAnonymousId()).toBe(null);
      expect(sessionManager.getDistinctId()).toMatch(PREFIX_ANONYMOUS_ID);
      expect(sessionManager.getSessionId()).not.toBe(initialSessionId);
      expect(sessionManager.getSessionId()).toMatch(PREFIX_SESSION_ID);
      expect(sessionManager.getLastEventAt()).toBe(null);
      // Device ID should not change by default
      expect(sessionManager.getDeviceId()).toBe(initialDeviceId);
    });

    it('should reset device ID when resetDeviceId is true', () => {
      const initialDeviceId = sessionManager.getDeviceId();

      sessionManager.reset({ resetDeviceId: true });

      expect(sessionManager.getDeviceId()).not.toBe(initialDeviceId);
      expect(sessionManager.getDeviceId()).toMatch(PREFIX_DEVICE_ID);
    });

    it('should reset tracking consent when resetTrackingConsent is true', () => {
      sessionManager.setTrackingConsent(TrackingConsent.GRANTED);
      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);

      sessionManager.reset({ resetTrackingConsent: true });

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.PENDING);
    });

    it('should preserve tracking consent when resetTrackingConsent is false', () => {
      sessionManager.setTrackingConsent(TrackingConsent.GRANTED);
      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);

      sessionManager.reset({ resetTrackingConsent: false });

      expect(sessionManager.getTrackingConsent()).toBe(TrackingConsent.GRANTED);
    });

    it('should persist reset state to storage', () => {
      sessionManager.identify('user123');
      sessionManager.reset();

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        testStorageKey,
        expect.stringContaining('"anonymousId":null')
      );
    });
  });
});
