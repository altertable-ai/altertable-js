import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkManager } from '../src/lib/networkManager';
import type { EventPayload, IdentifyPayload } from '../src/types';

// Mock fetch globally
const mockFetch = vi.fn();
Object.defineProperty(global, 'fetch', {
  value: mockFetch,
  writable: true,
});

describe('NetworkManager', () => {
  let networkManager: NetworkManager;
  const mockConfig = {
    baseUrl: 'https://api.example.com',
    apiKey: 'test-api-key',
    maxRetries: 3,
    requestTimeout: 10000,
    maxQueueSize: 100,
    batchDelay: 100,
    maxBatchSize: 10,
  };

  beforeEach(() => {
    networkManager = new NetworkManager(mockConfig);
    mockFetch.mockClear();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enqueue', () => {
    it('should add events to queue', () => {
      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      networkManager.enqueue('/track', eventPayload);
      expect(networkManager.getQueueSize()).toBe(1);
    });

    it('should schedule processing after enqueue', () => {
      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      networkManager.enqueue('/track', eventPayload);
      expect(networkManager.getStatus().isProcessing).toBe(false);

      // Fast-forward time to trigger processing
      vi.advanceTimersByTime(100);
      expect(networkManager.getQueueSize()).toBe(0);
    });

    it('should handle identify payloads', () => {
      const identifyPayload: IdentifyPayload = {
        environment: 'test',
        traits: { email: 'test@example.com' },
        user_id: 'user-123',
        visitor_id: 'visitor-123' as any,
      };

      networkManager.enqueue('/identify', identifyPayload);
      expect(networkManager.getQueueSize()).toBe(1);
    });
  });

  describe('batching', () => {
    it('should batch multiple events', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      // Add multiple events
      networkManager.enqueue('/track', eventPayload);
      networkManager.enqueue('/track', eventPayload);
      networkManager.enqueue('/track', eventPayload);

      expect(networkManager.getQueueSize()).toBe(3);

      // Fast-forward time to trigger processing
      vi.advanceTimersByTime(100);

      // Wait for async processing
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/batch',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          },
        })
      );
    });
  });

  describe('queue limits', () => {
    it('should respect max queue size', () => {
      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      // Add more events than the default max queue size (100)
      for (let i = 0; i < 105; i++) {
        networkManager.enqueue('/track', eventPayload);
      }

      expect(networkManager.getQueueSize()).toBe(100);
    });
  });

  describe('flush', () => {
    it('should immediately process queue', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      networkManager.enqueue('/track', eventPayload);
      expect(networkManager.getQueueSize()).toBe(1);

      await networkManager.flush();
      expect(networkManager.getQueueSize()).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should clear all events from queue', () => {
      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      networkManager.enqueue('/track', eventPayload);
      networkManager.enqueue('/track', eventPayload);
      expect(networkManager.getQueueSize()).toBe(2);

      networkManager.clear();
      expect(networkManager.getQueueSize()).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should retry failed requests', async () => {
      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true });

      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      networkManager.enqueue('/track', eventPayload);
      vi.advanceTimersByTime(100);

      // Wait for retry delay (1 second)
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('offline mode', () => {
    beforeEach(() => {
      // Mock navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
    });

    it('should queue events when offline', () => {
      // Set offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });

      // Create a new network manager to pick up the offline state
      const offlineNetworkManager = new NetworkManager(mockConfig);

      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      offlineNetworkManager.enqueue('/track', eventPayload);
      expect(offlineNetworkManager.getQueueSize()).toBe(1);
      expect(offlineNetworkManager.isOnline()).toBe(false);

      // Fast-forward time - should not process due to being offline
      vi.advanceTimersByTime(100);
      expect(offlineNetworkManager.getQueueSize()).toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should process queued events when coming back online', async () => {
      // Clear any previous calls
      mockFetch.mockClear();

      // Set offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });

      const offlineNetworkManager = new NetworkManager(mockConfig);

      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      offlineNetworkManager.enqueue('/track', eventPayload);
      expect(offlineNetworkManager.getQueueSize()).toBe(1);

      // Set online and trigger online event
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      // Simulate online event
      window.dispatchEvent(new Event('online'));

      // Wait for processing
      await vi.runAllTimersAsync();

      expect(offlineNetworkManager.getQueueSize()).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clean up
      offlineNetworkManager.destroy();
    });

    it('should include online status in getStatus', () => {
      const status = networkManager.getStatus();
      expect(status).toHaveProperty('isOnline');
      expect(typeof status.isOnline).toBe('boolean');
    });
  });

  describe('cleanup', () => {
    it('should clean up event listeners when destroyed', () => {
      // Mock addEventListener and removeEventListener
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const testNetworkManager = new NetworkManager(mockConfig);

      // Verify event listeners were added
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'online',
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'offline',
        expect.any(Function)
      );

      // Destroy the network manager
      testNetworkManager.destroy();

      // Verify event listeners were removed
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'online',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'offline',
        expect.any(Function)
      );

      // Clean up spies
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('should clear queue and timeouts when destroyed', () => {
      const testNetworkManager = new NetworkManager(mockConfig);

      // Add an event to the queue
      const eventPayload: EventPayload = {
        environment: 'test',
        event: 'test_event',
        properties: {},
        session_id: 'session-123' as any,
        timestamp: '2023-01-01T00:00:00.000Z',
        user_id: null,
        visitor_id: 'visitor-123' as any,
      };

      testNetworkManager.enqueue('/track', eventPayload);
      expect(testNetworkManager.getQueueSize()).toBe(1);

      // Destroy the network manager
      testNetworkManager.destroy();

      // Verify queue is cleared
      expect(testNetworkManager.getQueueSize()).toBe(0);
    });
  });
});
