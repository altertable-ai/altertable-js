import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrackingConsent } from '../src/constants';
import { createLogger } from '../src/lib/logger';
import { SessionManager } from '../src/lib/sessionManager';

describe('SessionManager with tracking consent', () => {
  let mockStorage: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    migrate: ReturnType<typeof vi.fn>;
  };
  let mockLogger: ReturnType<typeof createLogger>;
  let sessionManager: SessionManager;
  const testStorageKey = 'test-storage-key';

  beforeEach(() => {
    mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      migrate: vi.fn(),
    };
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
        visitorId: 'visitor-test-1',
        sessionId: 'session-test-1',
        userId: 'user123',
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
      expect(sessionManager.getUserId()).toBe('user123');
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
});
