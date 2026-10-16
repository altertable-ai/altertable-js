import {
  Altertable,
  type AltertableConfig,
  type EventProperties,
  getStorageKeys,
  TrackingConsent,
} from '@altertable/altertable-js';
import { AppState, Platform } from 'react-native';

import { createLogger } from './logger';
import { type AsyncStorageAdapter, hydrateStorage } from './storage';

/** Structurally compatible with @react-native-community/netinfo. */
export interface Connectivity {
  addEventListener(
    listener: (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => void
  ): () => void;
}

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
  /** Native async storage backend used to restore and persist identity and events. */
  storage: AsyncStorageAdapter;
  /** Persist unsent events. Defaults to true. Identity and consent remain durable. */
  eventPersistence?: boolean;
  /** Retry on reconnection and skip delivery while known offline. */
  connectivity?: Connectivity;
};

/** Mutable options. API key, environment, storage, and connectivity are fixed at creation. */
export type ReactNativeConfigUpdates = Omit<
  CoreOptions,
  'baseUrl' | 'environment'
>;

export type ScreenOptions = { id?: string; properties?: EventProperties };
/** A hydrated client. Keep one active instance per API key, environment, and storage backend. */
export type ReactNativeClient = Awaited<ReturnType<typeof createAltertable>>;

/**
 * Restore identity, consent, and unsent events before returning a ready client.
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

  if (!options?.storage) {
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

  function reportError(error: Error) {
    try {
      onError?.(error);
    } catch {
      /* Diagnostics must not interrupt delivery. */
    }
  }

  const keys = getStorageKeys(apiKey, config.environment);
  const storage = await hydrateStorage(
    backend,
    [keys.session, keys.events],
    (error, operation) => {
      logger.warnOnce(
        operation === 'read'
          ? 'Failed to restore analytics from storage. Retry createAltertable() after storage recovers.'
          : 'Failed to persist analytics. Recent changes are not durable; call flushPersistence() to retry.',
        error
      );
      reportError(error);
    }
  );
  if (!eventPersistence) {
    storage.removeItem(keys.events);
  }

  const core = new Altertable();
  let deliveryEnabled = false;
  let disposed = false;
  let online = true;
  let automaticFlushTask: Promise<void> | undefined;
  let flushDeferredByStorage = false;
  const cleanupCore = core.init(apiKey, {
    ...config,
    autoCapture: false,
    persistence: storage,
    eventPersistence: eventPersistence ? storage : false,
    flushIntervalMs: config.flushIntervalMs ?? 10_000,
    isOnline: () => {
      if (
        !deliveryEnabled ||
        disposed ||
        !online ||
        core.getTrackingConsent() !== TrackingConsent.GRANTED
      ) {
        return false;
      }
      // Automatic threshold/timer dispatch uses core's synchronous storage API.
      // Defer that attempt through the native flush so its writes finish first.
      if (storage.hasPendingWrites()) {
        flushDeferredByStorage = true;
        scheduleFlush();
        return false;
      }

      return true;
    },
    onError: reportError,
  });

  function assertNotDisposed() {
    if (disposed) {
      throw new Error(
        '[Altertable] This client has been disposed. Create a new client with createAltertable() to continue.'
      );
    }
  }

  function track(event: string, properties: EventProperties = {}) {
    assertNotDisposed();
    core.track(event, {
      $os: Platform.OS,
      $os_version: String(Platform.Version),
      ...properties,
      $lib: __LIB__,
      $lib_version: __LIB_VERSION__,
    });
  }

  async function flush({ drain = true } = {}) {
    assertNotDisposed();
    // Persist first: background network attempts must not delay native writes.
    await storage.flush();
    if (disposed) {
      return;
    }

    deliveryEnabled = true;
    flushDeferredByStorage = false;
    await core.flush({ drain });
    await storage.flush();
  }

  function scheduleFlush() {
    if (disposed || automaticFlushTask) {
      return;
    }

    // One snapshot per automatic attempt: failed batches wait for the next
    // interval, lifecycle transition, or connectivity recovery.
    automaticFlushTask = flush({ drain: false })
      .catch(() => {
        // Core delivery and storage already report errors through onError.
        flushDeferredByStorage = false;
      })
      .finally(() => {
        automaticFlushTask = undefined;
        if (flushDeferredByStorage) {
          scheduleFlush();
        }
      });
  }

  let appStateSubscription:
    | ReturnType<typeof AppState.addEventListener>
    | undefined;
  let unsubscribeConnectivity: (() => void) | undefined;

  function stopListenersAndTimers() {
    for (const stop of [
      () => appStateSubscription?.remove(),
      () => unsubscribeConnectivity?.(),
      cleanupCore,
    ]) {
      try {
        stop();
      } catch (error) {
        const sourceError =
          error instanceof Error ? error : new Error(String(error));
        logger.warnOnce(
          'Failed to remove a native subscription. Remaining cleanup will continue.',
          sourceError
        );
        reportError(sourceError);
      }
    }
  }

  try {
    await storage.flush();
    deliveryEnabled = true;
    appStateSubscription = AppState.addEventListener('change', state => {
      if (
        state === 'active' ||
        state === 'inactive' ||
        state === 'background'
      ) {
        scheduleFlush();
      }
    });
    unsubscribeConnectivity = connectivity?.addEventListener(state => {
      const wasOnline = online;
      online =
        state.isConnected !== false && state.isInternetReachable !== false;
      if (online && !wasOnline) {
        scheduleFlush();
      }
    });
  } catch (error) {
    disposed = true;
    stopListenersAndTimers();
    await storage.close().catch(() => {});
    throw error;
  }

  scheduleFlush();

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
      // A consent grant can synchronously replay and flush queued events in
      // core. Keep delivery paused until the updated consent is durable.
      const grantingConsent =
        updates.trackingConsent === TrackingConsent.GRANTED;
      if (grantingConsent) {
        deliveryEnabled = false;
      }
      if ('onError' in updates) {
        onError = updates.onError;
      }

      core.configure({ ...updates, onError: reportError });
      await storage.flush();
      if (grantingConsent && !disposed) {
        deliveryEnabled = true;
        scheduleFlush();
      }
    },
    /** Persist, drain deliverable events, and persist the result. Offline events remain queued. */
    flush: () => flush(),
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
        stopListenersAndTimers();
      }

      return storage.close();
    },
  };
}
