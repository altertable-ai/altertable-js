import {
  Altertable,
  type AltertableConfig,
  type EventProperties,
  getStorageKeys,
  getLegacyStorageKeys,
  TrackingConsent,
  type TrackingMode,
} from '@altertable/altertable-js';

import { createLogger } from './logger';
import { createReactNativePlatform, type Connectivity } from './platform';
import {
  type AsyncStorageAdapter,
  createMemoryStorage,
  hydrateStorage,
} from './storage';

export type { Connectivity } from './platform';

type CoreOptions = Pick<
  AltertableConfig,
  | 'baseUrl'
  | 'environment'
  | 'release'
  | 'debug'
  | 'trackingConsent'
  | 'onError'
  | 'transformEvent'
  | 'flushEventThreshold'
  | 'flushIntervalMs'
  | 'maxBatchSize'
>;
/** Core event options plus the native storage and optional connectivity adapters. */
export type ReactNativeConfig = CoreOptions & {
  /** Persist unsent events. Defaults to true. Identity and consent remain durable. */
  eventPersistence?: boolean;
  /** Retry on reconnection and skip delivery while known offline. */
  connectivity?: Connectivity;
} & (
    | {
        /** Product analytics (default). */
        mode?: 'product';
        /** Native async storage backend used to restore and persist identity and events. */
        storage: AsyncStorageAdapter;
      }
    | {
        /** Audience measurement: memory-only, without identity or OS context. Fixed for the client. */
        mode: 'audience';
        /** Ignored: audience clients never read or write native storage. */
        storage?: AsyncStorageAdapter;
      }
  );

/**
 * Mutable event options. Endpoint, storage, connectivity, and
 * event persistence are fixed at creation.
 */
export type ReactNativeConfigUpdates = Omit<
  CoreOptions,
  'baseUrl' | 'environment'
>;

export type ScreenOptions = { id?: string; properties?: EventProperties };
/** A hydrated client. Keep one active instance per API key and storage backend. */
export type ReactNativeClient = Awaited<ReturnType<typeof createAltertable>>;

/**
 * Restore identity, consent, and unsent events before returning a ready client.
 * Audience clients start empty and never access native storage.
 * Initialize once during app startup, then share it through AltertableProvider.
 * Rejects on storage read or initial write failure; calling again retries startup.
 * Dispose the previous client before creating a replacement with the same storage.
 */
export async function createAltertable(
  apiKey: string,
  options: ReactNativeConfig
) {
  if (!apiKey) {
    throw new Error(
      '[Altertable] Missing API key. Pass your API key to createAltertable().'
    );
  }

  // Validate before touching storage; core would only reject after hydration.
  const mode: TrackingMode = options?.mode ?? 'product';
  if (mode !== 'product' && mode !== 'audience') {
    throw new Error(
      '[Altertable] Invalid tracking mode. Use "product" or "audience".'
    );
  }

  if (mode === 'product' && !options.storage) {
    throw new Error(
      '[Altertable] Missing storage. Pass an async storage backend, such as AsyncStorage, to createAltertable().'
    );
  }

  const {
    storage: backend,
    connectivity,
    eventPersistence = true,
    ...config
  } = options;
  const logger = createLogger();
  let onError = config.onError;
  const reportedErrors = new WeakSet<Error>();

  function reportError(error: Error) {
    // A storage failure can surface both from its write task and delivery preparation.
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
    try {
      onError?.(error);
    } catch {
      /* Diagnostics must not interrupt delivery. */
    }
  }

  const keys = getStorageKeys(apiKey);
  const legacyKeys = getLegacyStorageKeys(apiKey, config.environment);
  const migrations: Array<[string, string]> = [
    [legacyKeys.session, keys.session],
  ];
  if (eventPersistence) migrations.push([legacyKeys.events, keys.events]);
  // Audience clients must not read, migrate, write, or clear product storage.
  const storage =
    mode === 'audience'
      ? createMemoryStorage()
      : await hydrateStorage(
          backend!,
          [keys.session, keys.events, legacyKeys.session, legacyKeys.events],
          (error, operation) => {
            logger.warnOnce(
              operation === 'read'
                ? 'Failed to restore analytics from storage. Retry createAltertable() after storage recovers.'
                : 'Failed to persist analytics. Recent changes are not durable; call flushPersistence() to retry.',
              error
            );
            reportError(error);
          },
          migrations
        );
  if (mode === 'product' && !eventPersistence) {
    storage.removeItem(keys.events);
    storage.removeItem(legacyKeys.events);
  }

  let disposed = false;
  // Startup and consent grants must persist before delivery can resume.
  let deliveryReady = false;
  const platform = createReactNativePlatform({
    mode,
    connectivity,
    async prepareDelivery() {
      await storage.flush();
      return deliveryReady;
    },
    onError: reportError,
  });
  const core = new Altertable(platform);
  let cleanupCore: () => void;
  try {
    cleanupCore = core.init(apiKey, {
      ...config,
      autoCapture: false,
      persistence: storage,
      eventPersistence: eventPersistence ? storage : false,
      flushIntervalMs: config.flushIntervalMs ?? 10_000,
      onError: reportError,
    });
  } catch (error) {
    await storage.close().catch(() => {});
    throw error;
  }

  function assertNotDisposed() {
    if (disposed) {
      throw new Error(
        '[Altertable] This client has been disposed. Create a new client with createAltertable() to continue.'
      );
    }
  }

  function track(event: string, properties: EventProperties = {}) {
    assertNotDisposed();
    core.track(event, properties);
  }

  async function flush() {
    assertNotDisposed();
    // Persist first: background network attempts must not delay native writes.
    await storage.flush();
    if (disposed) {
      return;
    }

    deliveryReady = true;
    await core.flush();
    await storage.flush();
  }

  try {
    await storage.flush();
  } catch (error) {
    disposed = true;
    cleanupCore();
    await storage.close().catch(() => {});
    throw error;
  }

  function flushInBackground() {
    void core.flush({ drain: false }).catch(() => {
      // Delivery and persistence report their own failures.
    });
  }

  deliveryReady = true;
  flushInBackground();

  return {
    /** Queue an event synchronously. Use flushPersistence() to await native writes. */
    track,
    /** Record a screen visit with native metadata. Call on navigation or focus changes. */
    screen(name: string, { id, properties }: ScreenOptions = {}) {
      track('$screen', {
        ...properties,
        $view_name: name,
        $view_type: 'screen',
        ...(id === undefined ? {} : { $view_id: id }),
      });
    },
    identify(...args: Parameters<Altertable['identify']>) {
      assertNotDisposed();
      core.identify(...args);
    },
    alias(...args: Parameters<Altertable['alias']>) {
      assertNotDisposed();
      core.alias(...args);
    },
    updateTraits(...args: Parameters<Altertable['updateTraits']>) {
      assertNotDisposed();
      core.updateTraits(...args);
    },
    getTrackingConsent: () => core.getTrackingConsent(),
    /** Clear unsent events and persist a new anonymous identity, preserving consent and device ID by default. */
    async reset(...args: Parameters<Altertable['reset']>) {
      assertNotDisposed();
      core.reset(...args);
      await storage.flush();
    },
    /** Update mutable options and await native writes. Consent grants are persisted before delivery. */
    async configure(updates: ReactNativeConfigUpdates) {
      assertNotDisposed();
      // Reject before consent or error-handler changes take effect.
      const requestedMode = (updates as { mode?: unknown }).mode;
      if (requestedMode !== undefined && requestedMode !== mode) {
        throw new Error(
          '[Altertable] The tracking mode is fixed for a client. Dispose it and create a new client with createAltertable() to change modes.'
        );
      }
      const grantingConsent =
        updates.trackingConsent === TrackingConsent.GRANTED;
      if (grantingConsent) deliveryReady = false;
      if ('onError' in updates) {
        onError = updates.onError;
      }

      core.configure({ ...updates, onError: reportError });
      await storage.flush();
      if (grantingConsent && !disposed) {
        deliveryReady = true;
        flushInBackground();
      }
    },
    /** Persist, drain deliverable events, and persist the result. Offline events remain queued. */
    flush,
    /** Wait for identity, consent, and event writes without making network requests. */
    flushPersistence() {
      assertNotDisposed();
      return storage.flush();
    },
    /**
     * Permanently stop listeners/timers and persist remaining events, without waiting for network.
     * Await before replacing the client. Repeat to retry failed final writes.
     * Subsequent tracking, configuration, and flush calls reject or throw.
     */
    dispose(): Promise<void> {
      if (!disposed) {
        disposed = true;
        cleanupCore();
      }

      return storage.close();
    },
  };
}
