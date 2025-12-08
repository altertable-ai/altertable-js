import { beforeEach, describe, expect, it } from 'vitest';

import {
  createStorageMock,
  StorageMock,
} from '../../../test-utils/mocks/storageMock';
import { TrackingConsent } from '../src/constants';
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
          visitorId: 'visitor-test-1',
          sessionId: 'session-test-1',
          userId: null,
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
          visitorId: 'visitor-test-1',
          sessionId: 'session-test-1',
          userId: null,
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

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        testStorageKey,
        expect.stringContaining('"trackingConsent":"granted"')
      );

      sessionManager.setTrackingConsent(TrackingConsent.DENIED);

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        testStorageKey,
        expect.stringContaining('"trackingConsent":"denied"')
      );
    });

    it('should handle tracking consent in session data recovery', () => {
      const storedData = JSON.stringify({
        anonymousId: 'visitor-test-1',
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
        visitorId: 'visitor-test-1',
        sessionId: 'session-test-1',
        userId: null,
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
        visitorId: 'visitor-test-1',
        sessionId: 'session-test-1',
        userId: null,
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
        visitorId: 'visitor-test-1',
        sessionId: 'session-test-1',
        userId: null,
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

  describe('isIdentified initialization', () => {
    it('should initialize isIdentified as true when anonymousId is null', () => {
      const storedData = JSON.stringify({
        deviceId: 'device-test-1',
        distinctId: 'user123',
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
      expect(sessionManager.getDistinctId()).toBe('user123');
    });

    it('should initialize isIdentified as false when anonymousId is not null', () => {
      const storedData = JSON.stringify({
        deviceId: 'device-test-1',
        distinctId: 'user123',
        anonymousId: 'visitor-test-1',
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
      expect(sessionManager.getAnonymousId()).toBe('visitor-test-1');
      expect(sessionManager.getDistinctId()).toBe('user123');
    });

    it('should initialize isIdentified as false when anonymousId is missing from stored data', () => {
      const storedData = JSON.stringify({
        deviceId: 'device-test-1',
        distinctId: 'user123',
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
});
