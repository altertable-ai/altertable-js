import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBatcher } from '../src/lib/batcher';
import type { StorageApi } from '../src/lib/storage';
import type { EventPayload, EventType } from '../src/types';

function createTrackPayload(timestamp: string): EventPayload {
  return {
    event: 'test',
    timestamp,
    properties: {},
    environment: 'test',
    device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
    anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    session_id: 'session-0197d9df-4e77-72cb-bf0a-e35b3f1f5425',
  };
}

function createMemoryStorage(store: Map<string, string>): StorageApi {
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
      return true;
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    migrate: (fromStorage: StorageApi, keys: string[]) => {
      for (const key of keys) {
        const value = fromStorage.getItem(key);
        if (value !== null) {
          store.set(key, value);
          fromStorage.removeItem(key);
        }
      }
    },
  };
}

describe('createBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes when combined buffer size reaches flushEventThreshold', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 3,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    batcher.add('identify', {
      environment: 'test',
      device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
      anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      traits: {},
    });
    expect(send).not.toHaveBeenCalled();

    batcher.add('alias', {
      environment: 'test',
      device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
      anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      new_user_id: 'u_new',
    });

    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('timer-based flush fires after flushIntervalMs', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 100,
      flushIntervalMs: 5_000,
      maxBatchSize: 50,
      send,
    });
    batcher.start();
    batcher.add('track', createTrackPayload('t1'));

    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(send).toHaveBeenCalledTimes(1);
    batcher.stop();
  });

  it('chunks payloads when more than flushEventThreshold of one type', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 2,
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      send,
    });

    batcher.add('track', createTrackPayload('a'));
    batcher.add('track', createTrackPayload('b'));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    batcher.add('track', createTrackPayload('c'));
    await batcher.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'a' }),
        expect.objectContaining({ timestamp: 'b' }),
      ])
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      'track',
      [expect.objectContaining({ timestamp: 'c' })]
    );
  });

  it('routes mixed types to separate send calls', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 2,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });

    const identifyPayload = {
      environment: 'test',
      device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c' as const,
      distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
      anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c' as const,
      traits: { x: 1 },
    };

    batcher.add('track', createTrackPayload('t1'));
    batcher.add('identify', identifyPayload as EventPayload);

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const types = send.mock.calls.map(call => call[0] as EventType);
    expect(types.sort()).toEqual(['identify', 'track']);
  });

  it('requeues chunk when send rejects', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(undefined);

    const batcher = createBatcher({
      flushEventThreshold: 1,
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    await batcher.flush();
    batcher.add('track', createTrackPayload('t2'));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));

    expect(send).toHaveBeenNthCalledWith(
      2,
      'track',
      expect.arrayContaining([expect.objectContaining({ timestamp: 't1' })])
    );
  });

  it('does not requeue chunk when clear() runs before a failed send settles', async () => {
    let rejectSend: (reason: unknown) => void;
    const send = vi.fn().mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject;
        })
    );

    const batcher = createBatcher({
      flushEventThreshold: 1,
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    expect(send).toHaveBeenCalledTimes(1);

    batcher.clear();
    rejectSend!(new Error('fail'));
    await Promise.resolve();
    await Promise.resolve();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flush() awaits in-flight dispatch started by flushEventThreshold before resolving', async () => {
    let resolveFirstSend: () => void;
    const send = vi.fn().mockImplementation(() => {
      if (send.mock.calls.length === 1) {
        return new Promise<void>(resolve => {
          resolveFirstSend = resolve;
        });
      }
      return Promise.resolve();
    });

    const batcher = createBatcher({
      flushEventThreshold: 1,
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    expect(send).toHaveBeenCalledTimes(1);

    let flushSettled = false;
    const flushPromise = batcher.flush().then(() => {
      flushSettled = true;
    });

    await Promise.resolve();
    expect(flushSettled).toBe(false);

    resolveFirstSend!();
    await flushPromise;
    expect(flushSettled).toBe(true);
  });

  it('flush() returns a promise that settles after sends complete', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });
    batcher.add('track', createTrackPayload('t1'));
    await batcher.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flush() does not await in-flight sends started by the interval timer', async () => {
    let resolveTimerSend: (() => void) | undefined;
    const send = vi.fn().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveTimerSend = resolve;
        })
    );

    const batcher = createBatcher({
      flushEventThreshold: 100,
      flushIntervalMs: 5_000,
      maxBatchSize: 50,
      send,
    });
    batcher.start();
    batcher.add('track', createTrackPayload('t1'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(send).toHaveBeenCalledTimes(1);

    const flushPromise = batcher.flush();
    await flushPromise;

    expect(resolveTimerSend).toBeDefined();
    resolveTimerSend!();
    await Promise.resolve();

    batcher.stop();
  });

  it('preserves timestamps when events wait in the buffer', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 10,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });
    batcher.start();

    batcher.add('track', createTrackPayload('2020-01-01T00:00:00.000Z'));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(send).toHaveBeenCalledWith(
      'track',
      expect.arrayContaining([
        expect.objectContaining({
          timestamp: '2020-01-01T00:00:00.000Z',
        }),
      ])
    );
    batcher.stop();
  });

  it('chunks by maxBatchSize when a flush holds more than maxBatchSize items', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 10,
      flushIntervalMs: 60_000,
      maxBatchSize: 3,
      send,
    });

    for (let index = 0; index < 7; index += 1) {
      batcher.add('track', createTrackPayload(`t${index}`));
    }
    await batcher.flush();

    const trackSends = send.mock.calls.filter(call => call[0] === 'track');
    expect(trackSends).toHaveLength(3);
    expect(trackSends[0][1]).toHaveLength(3);
    expect(trackSends[1][1]).toHaveLength(3);
    expect(trackSends[2][1]).toHaveLength(1);
  });

  it('flushEventThreshold triggers flush while chunk size follows maxBatchSize', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 4,
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      send,
    });

    batcher.add('track', createTrackPayload('a'));
    batcher.add('track', createTrackPayload('b'));
    batcher.add('track', createTrackPayload('c'));
    expect(send).not.toHaveBeenCalled();

    batcher.add('track', createTrackPayload('d'));
    await vi.waitFor(() => expect(send).toHaveBeenCalled());

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'a' }),
        expect.objectContaining({ timestamp: 'b' }),
      ])
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'c' }),
        expect.objectContaining({ timestamp: 'd' }),
      ])
    );
  });

  it('flushes when updateConfig lowers flushEventThreshold to at or below buffered count', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 100,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });

    batcher.add('track', createTrackPayload('a'));
    batcher.add('track', createTrackPayload('b'));
    batcher.add('track', createTrackPayload('c'));
    expect(send).not.toHaveBeenCalled();

    batcher.updateConfig({ flushEventThreshold: 3 });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'a' }),
        expect.objectContaining({ timestamp: 'b' }),
        expect.objectContaining({ timestamp: 'c' }),
      ])
    );
  });

  it('does not flush when updateConfig raises flushEventThreshold above buffered count', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 5,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });

    batcher.add('track', createTrackPayload('a'));
    batcher.add('track', createTrackPayload('b'));
    batcher.add('track', createTrackPayload('c'));
    expect(send).not.toHaveBeenCalled();

    batcher.updateConfig({ flushEventThreshold: 10 });
    expect(send).not.toHaveBeenCalled();
  });

  it('updateConfig replaces interval when flushIntervalMs changes while started', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 100,
      flushIntervalMs: 10_000,
      maxBatchSize: 50,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    batcher.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockClear();
    batcher.add('track', createTrackPayload('t2'));
    batcher.updateConfig({ flushIntervalMs: 2_000 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'track',
      expect.arrayContaining([expect.objectContaining({ timestamp: 't2' })])
    );

    batcher.stop();
  });

  it('persists buffered events before they are flushed', () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
      },
      send,
    });

    batcher.add('track', createTrackPayload('persisted'));

    expect(store.get('pending-events')).toContain('persisted');
    expect(send).not.toHaveBeenCalled();
  });

  it('rehydrates persisted events and removes them after a successful flush', async () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    const firstBatcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
      },
      send: vi.fn().mockResolvedValue(undefined),
    });
    firstBatcher.add('track', createTrackPayload('rehydrated'));

    const send = vi.fn().mockResolvedValue(undefined);
    const secondBatcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
      },
      send,
    });

    await secondBatcher.flush();

    expect(send).toHaveBeenCalledWith(
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'rehydrated' }),
      ])
    );
    expect(store.has('pending-events')).toBe(false);
  });

  it('keeps persisted events durable until the in-flight request succeeds', async () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    let resolveSend: () => void;
    const send = vi.fn().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveSend = resolve;
        })
    );
    const batcher = createBatcher({
      flushEventThreshold: 1,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
      },
      send,
    });

    batcher.add('track', createTrackPayload('in-flight'));
    expect(store.get('pending-events')).toContain('in-flight');

    resolveSend!();
    await batcher.flush();

    expect(store.has('pending-events')).toBe(false);
  });

  it('clears malformed persisted event buffers', () => {
    const store = new Map<string, string>([['pending-events', '{not-json']]);
    const storage = createMemoryStorage(store);
    const onFallback = vi.fn();

    createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
        onFallback,
      },
      send: vi.fn().mockResolvedValue(undefined),
    });

    expect(store.has('pending-events')).toBe(false);
    expect(onFallback).toHaveBeenCalledWith(
      'Persisted event buffer was unreadable and has been cleared.'
    );
  });

  it('clears expired persisted event buffers', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const store = new Map<string, string>([
      [
        'pending-events',
        JSON.stringify({
          version: 1,
          expiresAt: Date.parse('2025-01-01T00:00:00.000Z'),
          buffers: {
            track: [createTrackPayload('expired')],
            identify: [],
            alias: [],
          },
        }),
      ],
    ]);
    const storage = createMemoryStorage(store);
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
      },
      send,
    });

    await batcher.flush();

    expect(send).not.toHaveBeenCalled();
    expect(store.has('pending-events')).toBe(false);
  });

  it('drops oldest buffered events when the persisted event count cap is reached', () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    const onFallback = vi.fn();
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
        maxEventCount: 2,
        onFallback,
      },
      send: vi.fn().mockResolvedValue(undefined),
    });

    batcher.add('track', createTrackPayload('oldest'));
    batcher.add('track', createTrackPayload('middle'));
    batcher.add('track', createTrackPayload('newest'));

    const persisted = store.get('pending-events') ?? '';
    expect(persisted).not.toContain('oldest');
    expect(persisted).toContain('middle');
    expect(persisted).toContain('newest');
    expect(onFallback).toHaveBeenCalledWith(
      'Persisted event buffer is full (2 events). Dropping the oldest buffered event.'
    );
  });

  it('drops the oldest buffered event across event types when capped', () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
        maxEventCount: 2,
      },
      send: vi.fn().mockResolvedValue(undefined),
    });

    batcher.add('identify', {
      environment: 'test',
      device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      distinct_id: 'old-identify',
      anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      traits: {},
    });
    batcher.add('track', createTrackPayload('middle-track'));
    batcher.add('track', createTrackPayload('newest-track'));

    const persisted = store.get('pending-events') ?? '';
    expect(persisted).not.toContain('old-identify');
    expect(persisted).toContain('middle-track');
    expect(persisted).toContain('newest-track');
  });

  it('preserves buffered event order across reload before applying caps', () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    const firstBatcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
        maxEventCount: 10,
      },
      send: vi.fn().mockResolvedValue(undefined),
    });

    firstBatcher.add('identify', {
      environment: 'test',
      device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      distinct_id: 'old-identify',
      anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      traits: {},
    });
    firstBatcher.add('track', createTrackPayload('middle-track'));
    firstBatcher.add('track', createTrackPayload('newest-track'));

    const secondBatcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
        maxEventCount: 2,
      },
      send: vi.fn().mockResolvedValue(undefined),
    });
    secondBatcher.add('track', createTrackPayload('latest-track'));

    const persisted = store.get('pending-events') ?? '';
    expect(persisted).not.toContain('old-identify');
    expect(persisted).not.toContain('middle-track');
    expect(persisted).toContain('newest-track');
    expect(persisted).toContain('latest-track');
  });

  it('keeps in-flight events durable even when they exceed the count cap', () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    const onFallback = vi.fn();
    const send = vi.fn().mockImplementation(() => new Promise<void>(() => {}));
    const batcher = createBatcher({
      flushEventThreshold: 2,
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      persistence: {
        storage,
        storageKey: 'pending-events',
        maxEventCount: 2,
        onFallback,
      },
      send,
    });

    batcher.add('track', createTrackPayload('in-flight-1'));
    batcher.add('track', createTrackPayload('in-flight-2'));
    batcher.updateConfig({
      persistence: {
        storage,
        storageKey: 'pending-events',
        maxEventCount: 1,
        onFallback,
      },
    });

    expect(store.get('pending-events')).toContain('in-flight-1');
    expect(store.get('pending-events')).toContain('in-flight-2');
    expect(onFallback).not.toHaveBeenCalled();
  });


  it('drops oldest buffered events when the persisted byte cap is exceeded', () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    const onFallback = vi.fn();
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
        maxBytes: 10,
        onFallback,
      },
      send: vi.fn().mockResolvedValue(undefined),
    });

    batcher.add('track', createTrackPayload('too-large'));

    expect(store.has('pending-events')).toBe(false);
    expect(onFallback).toHaveBeenCalledWith(
      'Persisted event buffer exceeds 10 bytes. Dropping the oldest buffered event.'
    );
  });

  it('notifies fallback when durable event persistence fails', () => {
    const onFallback = vi.fn();
    const storage: StorageApi = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn().mockReturnValue(false),
      removeItem: vi.fn(),
      migrate: vi.fn(),
    };
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
        onFallback,
      },
      send: vi.fn().mockResolvedValue(undefined),
    });

    batcher.add('track', createTrackPayload('persist-fail'));

    expect(onFallback).toHaveBeenCalledWith(
      'Unable to persist event buffer. Offline delivery will continue in memory only.'
    );
  });

  it('keeps persisted events queued while offline and flushes after returning online', async () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    let isOnline = false;
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushEventThreshold: 1,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
      },
      isOnline: () => isOnline,
      send,
    });

    batcher.add('track', createTrackPayload('offline'));
    await batcher.flush();

    expect(send).not.toHaveBeenCalled();
    expect(store.get('pending-events')).toContain('offline');

    isOnline = true;
    await batcher.flush();

    expect(send).toHaveBeenCalledWith(
      'track',
      expect.arrayContaining([expect.objectContaining({ timestamp: 'offline' })])
    );
    expect(store.has('pending-events')).toBe(false);
  });

  it('leaves buffers intact when flushUnload runs while offline', () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    const sendUnload = vi.fn();
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
      },
      isOnline: () => false,
      send: vi.fn().mockResolvedValue(undefined),
    });

    batcher.add('track', createTrackPayload('unload-offline'));
    batcher.flushUnload(sendUnload);

    expect(sendUnload).not.toHaveBeenCalled();
    expect(store.get('pending-events')).toContain('unload-offline');
  });

  it('keeps unload-delivered events durable for a later normal flush', () => {
    const store = new Map<string, string>();
    const storage = createMemoryStorage(store);
    const sendUnload = vi.fn();
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      persistence: {
        storage,
        storageKey: 'pending-events',
      },
      send: vi.fn().mockResolvedValue(undefined),
    });

    batcher.add('track', createTrackPayload('unload-online'));
    batcher.flushUnload(sendUnload);

    expect(sendUnload).toHaveBeenCalledWith(
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'unload-online' }),
      ])
    );
    expect(store.get('pending-events')).toContain('unload-online');
  });

  it('throws when flush cannot drain a permanently failing sender', async () => {
    const batcher = createBatcher({
      flushEventThreshold: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send: vi.fn().mockRejectedValue(new Error('fail')),
    });

    batcher.add('track', createTrackPayload('never-drains'));

    await expect(batcher.flush()).rejects.toThrow(
      'Batcher flush exceeded 100 drain iterations'
    );
  });
});
