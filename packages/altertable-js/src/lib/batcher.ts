import type { EventPayload, EventType } from '../types';
import { invariant } from './invariant';

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
};

export type BatcherConfigurableKeys =
  | 'flushEventThreshold'
  | 'flushIntervalMs'
  | 'maxBatchSize';

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

/** Guard against pathological send() that never settles. */
const FLUSH_MAX_DRAIN_ITERATIONS = 100;

function createEmptyBuffers(): Map<EventType, EventPayload[]> {
  return new Map([
    ['track', []],
    ['identify', []],
    ['alias', []],
  ]);
}

function totalBufferedCount(buffers: Map<EventType, EventPayload[]>): number {
  let total = 0;
  for (const items of buffers.values()) {
    total += items.length;
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
  let config = initialConfig;
  let buffers = createEmptyBuffers();
  let intervalId: ReturnType<typeof setInterval> | undefined;
  /** Bumped on authoritative clear / unload so stale send failures do not requeue. */
  let bufferGeneration = 0;
  /** HTTP work started by the periodic timer — excluded from {@link flush} drain. */
  const inFlightTimer = new Set<Promise<void>>();
  /** All other sends (flushEventThreshold, manual flush, updateConfig). */
  const inFlightOther = new Set<Promise<void>>();

  function prependToBuffer(eventType: EventType, items: EventPayload[]): void {
    if (items.length === 0) {
      return;
    }
    const existing = buffers.get(eventType) ?? [];
    buffers.set(eventType, [...items, ...existing]);
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
        const chunkPromise = config.send(eventType, chunk).catch(() => {
          if (dispatchGeneration === bufferGeneration) {
            prependToBuffer(eventType, chunk);
          }
        });
        registerInFlight(chunkPromise, fromTimer);
        sendPromises.push(chunkPromise);
      }
    }
    return Promise.all(sendPromises).then(() => {});
  }

  async function flushUntilDrained(): Promise<void> {
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
      const snapshot = createEmptyBuffers();
      for (const eventType of EVENT_TYPES) {
        const items = buffers.get(eventType) ?? [];
        if (items.length > 0) {
          snapshot.set(eventType, [...items]);
        }
      }
      bufferGeneration += 1;
      for (const eventType of EVENT_TYPES) {
        buffers.set(eventType, []);
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
      const nextFlushEventThreshold =
        updates.flushEventThreshold ?? config.flushEventThreshold;
      const nextInterval = updates.flushIntervalMs ?? config.flushIntervalMs;
      const nextMaxBatch = updates.maxBatchSize ?? config.maxBatchSize;
      config = {
        ...config,
        flushEventThreshold: Math.max(1, nextFlushEventThreshold),
        flushIntervalMs: Math.max(1, nextInterval),
        maxBatchSize: Math.max(1, nextMaxBatch),
      };
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
