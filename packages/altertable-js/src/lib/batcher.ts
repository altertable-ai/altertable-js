import type { EventPayload, EventType } from '../types';
import { invariant } from './invariant';
import type { StorageApi } from './storage';

export type BatcherSendFn = (
  eventType: EventType,
  payloads: EventPayload[],
  signal: AbortSignal
) => Promise<void>;

export type BatcherConfig = {
  flushEventThreshold: number;
  flushIntervalMs: number;
  /** Maximum payloads per HTTP request per endpoint (chunk size). */
  maxBatchSize: number;
  send: BatcherSendFn;
  /** Coordinate automatic dispatch with runtime delivery preparation. */
  requestFlush?: (fromTimer: boolean) => void;
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
  requestFlush?: (fromTimer: boolean) => void;
  persistence?: ResolvedBatcherPersistence;
  isOnline: () => boolean;
};

type BufferedEventRef = {
  eventType: EventType;
  payload: EventPayload;
  unloadDispatched: boolean;
};

type BufferState = {
  buffers: Map<EventType, EventPayload[]>;
  order: BufferedEventRef[];
};

export type BatcherApi = {
  /** Add one payload to the in-memory buffer and persist the updated buffer if configured. */
  add(eventType: EventType, payload: EventPayload): void;
  /** Send buffered payloads now when online; resolves without sending while offline. */
  flush(options?: {
    drain?: boolean;
    prepare?: () => Promise<boolean>;
    /** Runs synchronously when events are selected, before preparation starts. */
    onSnapshot?: () => void;
  }): Promise<void>;
  /** Cancel delivery and drop buffered and in-flight payloads, including persisted copies. */
  clear(): void;
  /** Start periodic flushing with the configured interval. */
  start(): void;
  /** Stop periodic flushing without clearing queued payloads. */
  stop(): void;
  /** Cancel delivery and relinquish persistence ownership; in-flight requests may settle. */
  retire(): void;
  /** Best-effort page-unload delivery. Payloads remain persisted until normal send succeeds. */
  flushUnload(
    sendUnload: (eventType: EventType, payloads: EventPayload[]) => void
  ): void;
  /** Apply runtime config changes and immediately persist/flush if those changes require it. */
  updateConfig(
    updates: Partial<Pick<BatcherConfig, BatcherConfigurableKeys>>
  ): void;
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
    maxBytes: Math.max(1, persistence.maxBytes ?? DEFAULT_MAX_PERSISTED_BYTES),
    ttlMs: Math.max(1, persistence.ttlMs ?? DEFAULT_PERSISTED_TTL_MS),
    onFallback: persistence.onFallback,
  };
}

function resolveBatcherConfig(config: BatcherConfig): ResolvedBatcherConfig {
  return {
    send: config.send,
    requestFlush: config.requestFlush,
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

function isEventType(value: unknown): value is EventType {
  return EVENT_TYPES.includes(value as EventType);
}

function createBufferOrder(
  buffers: Map<EventType, EventPayload[]>
): BufferedEventRef[] {
  const order: BufferedEventRef[] = [];

  for (const eventType of EVENT_TYPES) {
    for (const payload of buffers.get(eventType) ?? []) {
      order.push({ eventType, payload, unloadDispatched: false });
    }
  }

  return order;
}

function readPersistedState(
  persistence: ResolvedBatcherPersistence | undefined
): BufferState {
  if (!persistence) {
    const buffers = createEmptyBuffers();
    return { buffers, order: [] };
  }

  const storedValue = persistence.storage.getItem(persistence.storageKey);
  if (!storedValue) {
    const buffers = createEmptyBuffers();
    return { buffers, order: [] };
  }

  try {
    const parsed = JSON.parse(storedValue) as {
      expiresAt?: number;
      buffers?: Partial<Record<EventType, EventPayload[]>>;
      order?: Array<{ eventType?: unknown; index?: unknown }>;
    };
    if (
      typeof parsed.expiresAt === 'number' &&
      parsed.expiresAt <= Date.now()
    ) {
      persistence.storage.removeItem(persistence.storageKey);
      const buffers = createEmptyBuffers();
      return { buffers, order: [] };
    }

    const persistedBuffers = parsed.buffers ?? {};
    const buffers = createEmptyBuffers();

    for (const eventType of EVENT_TYPES) {
      const items = persistedBuffers[eventType];
      if (Array.isArray(items)) {
        buffers.set(eventType, items);
      }
    }

    if (!Array.isArray(parsed.order)) {
      return { buffers, order: createBufferOrder(buffers) };
    }

    const seen = new Set<string>();
    const order: BufferedEventRef[] = [];
    for (const item of parsed.order) {
      if (
        !isEventType(item.eventType) ||
        typeof item.index !== 'number' ||
        !Number.isInteger(item.index)
      ) {
        continue;
      }

      const orderKey = `${item.eventType}:${item.index}`;
      if (seen.has(orderKey)) {
        continue;
      }

      const items = buffers.get(item.eventType) ?? [];
      const payload = items[item.index];
      if (!payload) {
        continue;
      }

      seen.add(orderKey);
      order.push({
        eventType: item.eventType,
        payload,
        unloadDispatched: false,
      });
    }

    for (const eventType of EVENT_TYPES) {
      const items = buffers.get(eventType) ?? [];
      for (let index = 0; index < items.length; index += 1) {
        if (!seen.has(`${eventType}:${index}`)) {
          order.push({
            eventType,
            payload: items[index],
            unloadDispatched: false,
          });
        }
      }
    }

    return { buffers, order };
  } catch {
    persistence.storage.removeItem(persistence.storageKey);
    persistence.onFallback?.(
      'Persisted event buffer was unreadable and has been cleared.'
    );
    const buffers = createEmptyBuffers();
    return { buffers, order: [] };
  }
}

function serializeBuffers(
  buffers: Map<EventType, EventPayload[]>,
  order: BufferedEventRef[],
  ttlMs: number
): string {
  const nextIndexByEventType = new Map<EventType, number>();

  return JSON.stringify({
    version: PERSISTED_BATCHER_VERSION,
    expiresAt: Date.now() + ttlMs,
    order: order
      .map(({ eventType, payload }) => {
        // Match the next occurrence so repeated object references stay distinct.
        const index = (buffers.get(eventType) ?? []).indexOf(
          payload,
          nextIndexByEventType.get(eventType) ?? 0
        );
        if (index === -1) {
          return undefined;
        }
        nextIndexByEventType.set(eventType, index + 1);
        return { eventType, index };
      })
      .filter(
        (item): item is { eventType: EventType; index: number } =>
          item !== undefined
      ),
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
  const initialState = readPersistedState(config.persistence);
  let buffers = initialState.buffers;
  let bufferOrder = initialState.order;
  let inFlightChunks = createEmptyChunkBuffers();
  let inFlightOrder: BufferedEventRef[] = [];
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let retired = false;
  let deliveryController = new AbortController();
  /** Bumped on authoritative clear / unload so stale send failures do not requeue. */
  let bufferGeneration = 0;
  let unloadFlushVersion = 0;
  let lastUnloadFlushVersion: number | undefined;
  /** HTTP work started by the periodic timer — excluded from {@link flush} drain. */
  const inFlightTimer = new Set<Promise<void>>();
  /** All other sends (flushEventThreshold, manual flush, updateConfig). */
  const inFlightOther = new Set<Promise<void>>();

  function getPersistableState(): BufferState {
    const persistableBuffers = createEmptyBuffers();

    for (const eventType of EVENT_TYPES) {
      const items: EventPayload[] = [];
      for (const chunk of inFlightChunks.get(eventType) ?? []) {
        items.push(...chunk);
      }
      items.push(...(buffers.get(eventType) ?? []));
      persistableBuffers.set(eventType, items);
    }

    return {
      buffers: persistableBuffers,
      order: [...inFlightOrder, ...bufferOrder],
    };
  }

  function markUnloadDirty(): void {
    unloadFlushVersion += 1;
  }

  function dropOldestBufferedEvent(reason: string): boolean {
    while (bufferOrder.length > 0) {
      const { eventType, payload } = bufferOrder.shift()!;
      const items = buffers.get(eventType) ?? [];
      const index = items.indexOf(payload);
      if (index !== -1) {
        items.splice(index, 1);
        buffers.set(eventType, items);
        markUnloadDirty();
        config.persistence?.onFallback?.(reason);
        return true;
      }
    }

    for (const eventType of EVENT_TYPES) {
      const items = buffers.get(eventType) ?? [];
      const payload = items.shift();
      if (payload) {
        buffers.set(eventType, items);
        markUnloadDirty();
        config.persistence?.onFallback?.(reason);
        return true;
      }
    }

    return false;
  }

  function serializePersistableBuffersWithinLimits(): string {
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

    let persistableState = getPersistableState();
    let serialized = serializeBuffers(
      persistableState.buffers,
      persistableState.order,
      ttlMs
    );
    while (
      serialized.length > maxBytes &&
      dropOldestBufferedEvent(
        `Persisted event buffer exceeds ${maxBytes} bytes. Dropping the oldest buffered event.`
      )
    ) {
      persistableState = getPersistableState();
      serialized = serializeBuffers(
        persistableState.buffers,
        persistableState.order,
        ttlMs
      );
    }

    return serialized;
  }

  function persistBuffers(): void {
    if (retired || !config.persistence) {
      return;
    }

    if (
      totalBufferedCount(buffers) === 0 &&
      totalInFlightCount(inFlightChunks) === 0
    ) {
      config.persistence.storage.removeItem(config.persistence.storageKey);
      return;
    }

    const serialized = serializePersistableBuffersWithinLimits();
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

  function prependToBuffer(
    eventType: EventType,
    items: EventPayload[],
    refs: BufferedEventRef[]
  ): void {
    const existing = buffers.get(eventType) ?? [];
    buffers.set(eventType, [...items, ...existing]);
    bufferOrder = [...refs, ...bufferOrder];
    markUnloadDirty();
  }

  function addInFlightChunk(eventType: EventType, chunk: EventPayload[]): void {
    const chunks = inFlightChunks.get(eventType) ?? [];
    chunks.push(chunk);
    inFlightChunks.set(eventType, chunks);
  }

  function removeInFlightChunk(
    eventType: EventType,
    chunk: EventPayload[],
    refs: BufferedEventRef[]
  ): void {
    const chunks = inFlightChunks.get(eventType) ?? [];
    const index = chunks.indexOf(chunk);
    if (index !== -1) {
      chunks.splice(index, 1);
      inFlightChunks.set(eventType, chunks);
    }

    for (const ref of refs) {
      const orderIndex = inFlightOrder.indexOf(ref);
      if (orderIndex !== -1) {
        inFlightOrder.splice(orderIndex, 1);
      }
    }
  }

  function registerInFlight(
    chunkPromise: Promise<void>,
    fromTimer: boolean
  ): void {
    const bucket = fromTimer ? inFlightTimer : inFlightOther;
    bucket.add(chunkPromise);
    const release = () => {
      bucket.delete(chunkPromise);
    };
    void chunkPromise.then(release, release);
  }

  /**
   * Snapshots and clears buffers, then starts sends. The returned promise
   * settles when all chunk sends for this snapshot finish.
   */
  function dispatchFlushFromBuffer(
    fromTimer: boolean,
    selectedRefs: readonly BufferedEventRef[] = bufferOrder
  ): Promise<void> {
    if (retired || !config.isOnline()) return Promise.resolve();

    const selected = new Set(selectedRefs);
    const snapshot = createEmptyBuffers();
    const remaining = createEmptyBuffers();
    const snapshotOrder: BufferedEventRef[] = [];
    const remainingOrder: BufferedEventRef[] = [];
    for (const ref of bufferOrder) {
      if (selected.has(ref)) {
        snapshot.get(ref.eventType)!.push(ref.payload);
        snapshotOrder.push(ref);
      } else {
        remaining.get(ref.eventType)!.push(ref.payload);
        remainingOrder.push(ref);
      }
    }
    if (snapshotOrder.length === 0) return Promise.resolve();

    const dispatchGeneration = bufferGeneration;
    const signal = deliveryController.signal;
    const snapshotRefsByType = new Map(
      EVENT_TYPES.map(eventType => [
        eventType,
        snapshotOrder.filter(ref => ref.eventType === eventType),
      ])
    );
    buffers = remaining;
    bufferOrder = remainingOrder;
    inFlightOrder.push(...snapshotOrder);

    const sendPromises: Promise<void>[] = [];
    for (const eventType of EVENT_TYPES) {
      const items = snapshot.get(eventType) ?? [];
      for (const chunk of chunkArray(items, config.maxBatchSize)) {
        const chunkRefs = snapshotRefsByType
          .get(eventType)!
          .splice(0, chunk.length);
        addInFlightChunk(eventType, chunk);
        const chunkPromise = config
          .send(eventType, chunk, signal)
          .then(
            () => removeInFlightChunk(eventType, chunk, chunkRefs),
            () => {
              removeInFlightChunk(eventType, chunk, chunkRefs);
              if (dispatchGeneration === bufferGeneration) {
                prependToBuffer(eventType, chunk, chunkRefs);
              }
              return;
            }
          )
          .then(() => persistBuffers());
        registerInFlight(chunkPromise, fromTimer);
        sendPromises.push(chunkPromise);
      }
    }
    persistBuffers();
    return Promise.all(sendPromises).then((): void => undefined);
  }

  function requestFlush(fromTimer: boolean) {
    if (config.requestFlush) {
      config.requestFlush(fromTimer);
    } else {
      void dispatchFlushFromBuffer(fromTimer);
    }
  }

  function flushSnapshot(
    fromTimer: boolean,
    prepare?: () => Promise<boolean>,
    onSnapshot?: () => void
  ): Promise<boolean> {
    if (retired || !config.isOnline()) return Promise.resolve(false);
    const generation = bufferGeneration;
    // Keep these refs buffered and persisted while preparing. Later arrivals
    // belong to another snapshot, even if they arrive in a promise continuation.
    const selected = [...bufferOrder];
    onSnapshot?.();
    const dispatch = () =>
      dispatchFlushFromBuffer(fromTimer, selected).then(() => true);
    if (!prepare) return dispatch();
    return prepare().then(ready =>
      ready && generation === bufferGeneration ? dispatch() : false
    );
  }

  async function flushUntilDrained(
    prepare?: () => Promise<boolean>
  ): Promise<void> {
    if (retired || !config.isOnline()) {
      return;
    }

    for (
      let iteration = 0;
      iteration < FLUSH_MAX_DRAIN_ITERATIONS;
      iteration += 1
    ) {
      await Promise.all(inFlightOther);
      if (!(await flushSnapshot(false, prepare))) return;
      if (retired || !config.isOnline()) {
        return;
      }
      if (totalBufferedCount(buffers) === 0 && inFlightOther.size === 0) {
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
      if (retired) return;
      const list = buffers.get(eventType) ?? [];
      list.push(payload);
      buffers.set(eventType, list);
      bufferOrder.push({ eventType, payload, unloadDispatched: false });
      markUnloadDirty();
      persistBuffers();
      if (totalBufferedCount(buffers) >= config.flushEventThreshold) {
        requestFlush(false);
      }
    },

    flush({ drain = true, prepare, onSnapshot } = {}): Promise<void> {
      return drain
        ? flushUntilDrained(prepare)
        : flushSnapshot(false, prepare, onSnapshot).then((): void => undefined);
    },

    clear(): void {
      bufferGeneration += 1;
      const cancelledDelivery = deliveryController;
      deliveryController = new AbortController();
      buffers = createEmptyBuffers();
      bufferOrder = [];
      inFlightChunks = createEmptyChunkBuffers();
      inFlightOrder = [];
      markUnloadDirty();
      cancelledDelivery.abort();
      persistBuffers();
    },

    start(): void {
      if (retired || intervalId !== undefined) {
        return;
      }
      intervalId = setInterval(() => {
        requestFlush(true);
      }, config.flushIntervalMs);
    },

    stop(): void {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    },

    retire(): void {
      retired = true;
      bufferGeneration += 1;
      deliveryController.abort();
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    },

    flushUnload(
      sendUnload: (eventType: EventType, payloads: EventPayload[]) => void
    ): void {
      if (retired || !config.isOnline()) {
        return;
      }
      if (lastUnloadFlushVersion === unloadFlushVersion) {
        return;
      }

      const snapshot = createEmptyBuffers();
      let hadAny = false;
      for (const ref of bufferOrder) {
        if (ref.unloadDispatched) {
          continue;
        }
        ref.unloadDispatched = true;
        hadAny = true;
        snapshot.get(ref.eventType)!.push(ref.payload);
      }
      if (!hadAny) {
        return;
      }
      lastUnloadFlushVersion = unloadFlushVersion;
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
      if (retired) return;
      config = resolveBatcherConfig({
        send: config.send,
        requestFlush: config.requestFlush,
        flushEventThreshold:
          updates.flushEventThreshold ?? config.flushEventThreshold,
        flushIntervalMs: updates.flushIntervalMs ?? config.flushIntervalMs,
        maxBatchSize: updates.maxBatchSize ?? config.maxBatchSize,
        persistence:
          'persistence' in updates ? updates.persistence : config.persistence,
        isOnline: updates.isOnline ?? config.isOnline,
      });
      if ('persistence' in updates) {
        persistBuffers();
      }
      if (updates.flushIntervalMs !== undefined && intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
        intervalId = setInterval(() => {
          requestFlush(true);
        }, config.flushIntervalMs);
      }
      if (
        updates.flushEventThreshold !== undefined &&
        totalBufferedCount(buffers) >= config.flushEventThreshold
      ) {
        requestFlush(false);
      }
    },
  };
}
