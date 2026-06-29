import type { EventPayload, EventType } from '../types';
import { invariant } from './invariant';
import type { StorageApi } from './storage';

export type BatcherSendFn = (
  eventType: EventType,
  payloads: EventPayload[]
) => Promise<void>;

export type BatcherConfig = {
  flushEventThreshold: number;
  flushIntervalMs: number;
  /** Maximum payloads per HTTP request per endpoint (chunk size). */
  maxBatchSize: number;
  send: BatcherSendFn;
  persistence?: {
    storage: StorageApi;
    storageKey: string;
    maxEventCount?: number;
    maxBytes?: number;
    ttlMs?: number;
    onFallback?: (message: string) => void;
  };
  isOnline?: () => boolean;
};

export type BatcherConfigurableKeys =
  | 'flushEventThreshold'
  | 'flushIntervalMs'
  | 'maxBatchSize'
  | 'persistence'
  | 'isOnline';

type ResolvedBatcherPersistence = {
  storage: StorageApi;
  storageKey: string;
  maxEventCount: number;
  maxBytes: number;
  ttlMs: number;
  onFallback?: (message: string) => void;
};

/** Configuration after defaults are applied. */
type ResolvedBatcherConfig = {
  flushEventThreshold: number;
  flushIntervalMs: number;
  maxBatchSize: number;
  send: BatcherSendFn;
  persistence?: ResolvedBatcherPersistence;
  isOnline: () => boolean;
};

export type BatcherApi = {
  add(eventType: EventType, payload: EventPayload): void;
  flush(): Promise<void>;
  clear(): void;
  start(): void;
  stop(): void;
  flushUnload(
    sendUnload: (eventType: EventType, payloads: EventPayload[]) => void
  ): void;
  updateConfig(updates: Partial<Pick<BatcherConfig, BatcherConfigurableKeys>>): void;
};

const EVENT_TYPES: EventType[] = ['track', 'identify', 'alias'];
const PERSISTED_BATCHER_VERSION = 1;
const DEFAULT_MAX_PERSISTED_EVENT_COUNT = 1_000;
const DEFAULT_MAX_PERSISTED_BYTES = 512 * 1_024;
const DEFAULT_PERSISTED_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

/** Guard against pathological send() that never settles. */
const FLUSH_MAX_DRAIN_ITERATIONS = 100;

function resolveBatcherPersistence(
  persistence: BatcherConfig['persistence']
): ResolvedBatcherPersistence | undefined {
  if (!persistence) {
    return undefined;
  }

  return {
    storage: persistence.storage,
    storageKey: persistence.storageKey,
    maxEventCount: Math.max(
      1,
      persistence.maxEventCount ?? DEFAULT_MAX_PERSISTED_EVENT_COUNT
    ),
    maxBytes: Math.max(
      1,
      persistence.maxBytes ?? DEFAULT_MAX_PERSISTED_BYTES
    ),
    ttlMs: Math.max(1, persistence.ttlMs ?? DEFAULT_PERSISTED_TTL_MS),
    onFallback: persistence.onFallback,
  };
}

function resolveBatcherConfig(config: BatcherConfig): ResolvedBatcherConfig {
  return {
    send: config.send,
    flushEventThreshold: Math.max(1, config.flushEventThreshold),
    flushIntervalMs: Math.max(1, config.flushIntervalMs),
    maxBatchSize: Math.max(1, config.maxBatchSize),
    persistence: resolveBatcherPersistence(config.persistence),
    isOnline: config.isOnline ?? (() => true),
  };
}

function createEmptyBuffers(): Map<EventType, EventPayload[]> {
  return new Map([
    ['track', []],
    ['identify', []],
    ['alias', []],
  ]);
}

function createEmptyChunkBuffers(): Map<EventType, EventPayload[][]> {
  return new Map([
    ['track', []],
    ['identify', []],
    ['alias', []],
  ]);
}

function readPersistedBuffers(
  persistence: ResolvedBatcherPersistence | undefined
): Map<EventType, EventPayload[]> {
  if (!persistence) {
    return createEmptyBuffers();
  }

  const storedValue = persistence.storage.getItem(persistence.storageKey);
  if (!storedValue) {
    return createEmptyBuffers();
  }

  try {
    const parsed = JSON.parse(storedValue) as {
      expiresAt?: number;
      buffers?: Partial<Record<EventType, EventPayload[]>>;
    };
    if (
      typeof parsed.expiresAt === 'number' &&
      parsed.expiresAt <= Date.now()
    ) {
      persistence.storage.removeItem(persistence.storageKey);
      return createEmptyBuffers();
    }

    const persistedBuffers = parsed.buffers ?? {};
    const buffers = createEmptyBuffers();

    for (const eventType of EVENT_TYPES) {
      const items = persistedBuffers[eventType];
      if (Array.isArray(items)) {
        buffers.set(eventType, items);
      }
    }

    return buffers;
  } catch {
    persistence.storage.removeItem(persistence.storageKey);
    persistence.onFallback?.(
      'Persisted event buffer was unreadable and has been cleared.'
    );
    return createEmptyBuffers();
  }
}

function serializeBuffers(
  buffers: Map<EventType, EventPayload[]>,
  ttlMs: number
): string {
  return JSON.stringify({
    version: PERSISTED_BATCHER_VERSION,
    expiresAt: Date.now() + ttlMs,
    buffers: {
      track: buffers.get('track') ?? [],
      identify: buffers.get('identify') ?? [],
      alias: buffers.get('alias') ?? [],
    },
  });
}

function totalBufferedCount(buffers: Map<EventType, EventPayload[]>): number {
  let total = 0;
  for (const items of buffers.values()) {
    total += items.length;
  }
  return total;
}

function totalInFlightCount(
  chunksByType: Map<EventType, EventPayload[][]>
): number {
  let total = 0;
  for (const chunks of chunksByType.values()) {
    for (const chunk of chunks) {
      total += chunk.length;
    }
  }
  return total;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) {
    return [];
  }
  const safeChunkSize = Math.max(1, chunkSize);
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += safeChunkSize) {
    chunks.push(items.slice(index, index + safeChunkSize));
  }
  return chunks;
}

/**
 * Buffers outbound analytics payloads per endpoint type, flushes when the
 * combined queue reaches `flushEventThreshold`, on an interval, or when `flush()` is called.
 * Each send uses chunks of at most `maxBatchSize` payloads per endpoint.
 *
 * When `flushEventThreshold` is reached inside `add()`, dispatch runs synchronously until
 * each HTTP request is started (so callers/tests can observe `fetch` in the
 * same turn).
 */
export function createBatcher(initialConfig: BatcherConfig): BatcherApi {
  let config = resolveBatcherConfig(initialConfig);
  let buffers = readPersistedBuffers(config.persistence);
  let inFlightChunks = createEmptyChunkBuffers();
  let intervalId: ReturnType<typeof setInterval> | undefined;
  /** Bumped on authoritative clear / unload so stale send failures do not requeue. */
  let bufferGeneration = 0;
  /** HTTP work started by the periodic timer — excluded from {@link flush} drain. */
  const inFlightTimer = new Set<Promise<void>>();
  /** All other sends (flushEventThreshold, manual flush, updateConfig). */
  const inFlightOther = new Set<Promise<void>>();

  function getDurableBuffers(): Map<EventType, EventPayload[]> {
    const durableBuffers = createEmptyBuffers();

    for (const eventType of EVENT_TYPES) {
      const durableItems: EventPayload[] = [];
      for (const chunk of inFlightChunks.get(eventType) ?? []) {
        durableItems.push(...chunk);
      }
      durableItems.push(...(buffers.get(eventType) ?? []));
      durableBuffers.set(eventType, durableItems);
    }

    return durableBuffers;
  }

  function dropOldestBufferedEvent(reason: string): boolean {
    for (const eventType of EVENT_TYPES) {
      const items = buffers.get(eventType) ?? [];
      if (items.length > 0) {
        items.shift();
        buffers.set(eventType, items);
        config.persistence?.onFallback?.(reason);
        return true;
      }
    }
    return false;
  }

  function serializeDurableBuffersWithinLimits(): string {
    const { maxEventCount, maxBytes, ttlMs } = config.persistence!;

    while (
      totalBufferedCount(buffers) + totalInFlightCount(inFlightChunks) >
      maxEventCount
    ) {
      if (
        !dropOldestBufferedEvent(
          `Persisted event buffer is full (${maxEventCount} events). Dropping the oldest buffered event.`
        )
      ) {
        break;
      }
    }

    let serialized = serializeBuffers(getDurableBuffers(), ttlMs);
    while (
      serialized.length > maxBytes &&
      dropOldestBufferedEvent(
        `Persisted event buffer exceeds ${maxBytes} bytes. Dropping the oldest buffered event.`
      )
    ) {
      serialized = serializeBuffers(getDurableBuffers(), ttlMs);
    }

    return serialized;
  }

  function persistBuffers(): void {
    if (!config.persistence) {
      return;
    }

    if (
      totalBufferedCount(buffers) === 0 &&
      totalInFlightCount(inFlightChunks) === 0
    ) {
      config.persistence.storage.removeItem(config.persistence.storageKey);
      return;
    }

    const serialized = serializeDurableBuffersWithinLimits();
    if (
      totalBufferedCount(buffers) === 0 &&
      totalInFlightCount(inFlightChunks) === 0
    ) {
      config.persistence.storage.removeItem(config.persistence.storageKey);
      return;
    }

    const didPersist = config.persistence.storage.setItem(
      config.persistence.storageKey,
      serialized
    );
    if (didPersist === false) {
      config.persistence?.onFallback?.(
        'Unable to persist event buffer. Offline delivery will continue in memory only.'
      );
    }
  }

  function prependToBuffer(eventType: EventType, items: EventPayload[]): void {
    const existing = buffers.get(eventType) ?? [];
    buffers.set(eventType, [...items, ...existing]);
    persistBuffers();
  }

  function addInFlightChunk(eventType: EventType, chunk: EventPayload[]): void {
    const chunks = inFlightChunks.get(eventType) ?? [];
    chunks.push(chunk);
    inFlightChunks.set(eventType, chunks);
  }

  function removeInFlightChunk(eventType: EventType, chunk: EventPayload[]): void {
    const chunks = inFlightChunks.get(eventType) ?? [];
    const index = chunks.indexOf(chunk);
    if (index !== -1) {
      chunks.splice(index, 1);
      inFlightChunks.set(eventType, chunks);
    }
  }

  function registerInFlight(
    chunkPromise: Promise<void>,
    fromTimer: boolean
  ): void {
    const bucket = fromTimer ? inFlightTimer : inFlightOther;
    bucket.add(chunkPromise);
    void chunkPromise.finally(() => {
      bucket.delete(chunkPromise);
    });
  }

  /**
   * Snapshots and clears buffers, then starts sends. The returned promise
   * settles when all chunk sends for this snapshot finish.
   */
  function dispatchFlushFromBuffer(fromTimer: boolean): Promise<void> {
    if (!config.isOnline()) {
      return Promise.resolve();
    }

    const dispatchGeneration = bufferGeneration;
    const snapshot = createEmptyBuffers();
    let hadAny = false;
    for (const eventType of EVENT_TYPES) {
      const items = buffers.get(eventType) ?? [];
      if (items.length > 0) {
        hadAny = true;
        snapshot.set(eventType, [...items]);
      }
    }
    if (!hadAny) {
      return Promise.resolve();
    }
    for (const eventType of EVENT_TYPES) {
      buffers.set(eventType, []);
    }

    const sendPromises: Promise<void>[] = [];
    for (const eventType of EVENT_TYPES) {
      const items = snapshot.get(eventType) ?? [];
      for (const chunk of chunkArray(items, config.maxBatchSize)) {
        addInFlightChunk(eventType, chunk);
        const chunkPromise = config
          .send(eventType, chunk)
          .then(() => {
            removeInFlightChunk(eventType, chunk);
            persistBuffers();
          })
          .catch(() => {
            removeInFlightChunk(eventType, chunk);
            if (dispatchGeneration === bufferGeneration) {
              prependToBuffer(eventType, chunk);
            } else {
              persistBuffers();
            }
          });
        registerInFlight(chunkPromise, fromTimer);
        sendPromises.push(chunkPromise);
      }
    }
    persistBuffers();
    return Promise.all(sendPromises).then(() => {});
  }

  async function flushUntilDrained(): Promise<void> {
    if (!config.isOnline()) {
      return;
    }

    for (let iteration = 0; iteration < FLUSH_MAX_DRAIN_ITERATIONS; iteration += 1) {
      await Promise.all([...inFlightOther]);
      await dispatchFlushFromBuffer(false);
      if (
        totalBufferedCount(buffers) === 0 &&
        inFlightOther.size === 0
      ) {
        return;
      }
    }
    invariant(
      false,
      `Batcher flush exceeded ${FLUSH_MAX_DRAIN_ITERATIONS} drain iterations; ensure send() always settles.`
    );
  }

  return {
    add(eventType: EventType, payload: EventPayload): void {
      const list = buffers.get(eventType) ?? [];
      list.push(payload);
      buffers.set(eventType, list);
      persistBuffers();
      if (totalBufferedCount(buffers) >= config.flushEventThreshold) {
        void dispatchFlushFromBuffer(false);
      }
    },

    flush(): Promise<void> {
      return flushUntilDrained();
    },

    clear(): void {
      bufferGeneration += 1;
      buffers = createEmptyBuffers();
      inFlightChunks = createEmptyChunkBuffers();
      persistBuffers();
    },

    start(): void {
      if (intervalId !== undefined) {
        return;
      }
      intervalId = setInterval(() => {
        void dispatchFlushFromBuffer(true);
      }, config.flushIntervalMs);
    },

    stop(): void {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    },

    flushUnload(
      sendUnload: (eventType: EventType, payloads: EventPayload[]) => void
    ): void {
      if (!config.isOnline()) {
        return;
      }

      const snapshot = createEmptyBuffers();
      for (const eventType of EVENT_TYPES) {
        const items = buffers.get(eventType) ?? [];
        if (items.length > 0) {
          snapshot.set(eventType, [...items]);
        }
      }
      for (const eventType of EVENT_TYPES) {
        const items = snapshot.get(eventType) ?? [];
        for (const chunk of chunkArray(items, config.maxBatchSize)) {
          sendUnload(eventType, chunk);
        }
      }
    },

    updateConfig(
      updates: Partial<Pick<BatcherConfig, BatcherConfigurableKeys>>
    ): void {
      config = resolveBatcherConfig({
        send: config.send,
        flushEventThreshold:
          updates.flushEventThreshold ?? config.flushEventThreshold,
        flushIntervalMs: updates.flushIntervalMs ?? config.flushIntervalMs,
        maxBatchSize: updates.maxBatchSize ?? config.maxBatchSize,
        persistence:
          updates.persistence !== undefined
            ? updates.persistence
            : config.persistence,
        isOnline: updates.isOnline ?? config.isOnline,
      });
      if (updates.persistence !== undefined) {
        persistBuffers();
      }
      if (updates.flushIntervalMs !== undefined && intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
        intervalId = setInterval(() => {
          void dispatchFlushFromBuffer(true);
        }, config.flushIntervalMs);
      }
      if (
        updates.flushEventThreshold !== undefined &&
        totalBufferedCount(buffers) >= config.flushEventThreshold
      ) {
        void dispatchFlushFromBuffer(false);
      }
    },
  };
}
