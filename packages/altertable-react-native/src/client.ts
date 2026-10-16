import {
  Altertable,
  type AltertableConfig,
  type EventProperties,
  getStorageKeys,
  TrackingConsent,
} from '@altertable/altertable-js';
import { AppState, Platform } from 'react-native';

import { type AsyncStorage, hydrateStorage } from './storage';

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
export type ReactNativeConfig = CoreOptions & {
  /** Native async storage backend used to restore and persist identity and events. */
  storage: AsyncStorage;
  /** Persist unsent events. Defaults to true. Identity and consent remain durable. */
  eventPersistence?: boolean;
  /** Retry on reconnection and skip delivery while known offline. */
  connectivity?: Connectivity;
};

export type ReactNativeConfigUpdates = Omit<
  CoreOptions,
  'baseUrl' | 'environment'
>;

export type ScreenOptions = { id?: string; properties?: EventProperties };
export type ReactNativeClient = Awaited<ReturnType<typeof createAltertable>>;

/** Restore identity, consent, and buffered events before exposing a ready client. */
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
    reportError
  ).catch(error => {
    const sourceError =
      error instanceof Error ? error : new Error(String(error));
    reportError(sourceError);
    throw sourceError;
  });
  if (!eventPersistence) {
    storage.removeItem(keys.events);
  }

  const core = new Altertable();
  let deliveryEnabled = false;
  let disposed = false;
  let online = true;
  let automaticFlush: Promise<void> | undefined;
  let deferredDelivery = false;
  const cleanup = core.init(apiKey, {
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
        deferredDelivery = true;
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
    deferredDelivery = false;
    await core.flush({ drain });
    await storage.flush();
  }

  function scheduleFlush() {
    if (disposed || automaticFlush) {
      return;
    }

    // One snapshot per automatic attempt: failed batches wait for the next
    // interval, lifecycle transition, or connectivity recovery.
    automaticFlush = flush({ drain: false })
      .catch(() => {
        // Core delivery and storage already report errors through onError.
        deferredDelivery = false;
      })
      .finally(() => {
        automaticFlush = undefined;
        if (deferredDelivery) {
          scheduleFlush();
        }
      });
  }

  let appStateSubscription:
    | ReturnType<typeof AppState.addEventListener>
    | undefined;
  let unsubscribeConnectivity: (() => void) | undefined;

  function stopSubscriptions() {
    for (const stop of [
      () => appStateSubscription?.remove(),
      () => unsubscribeConnectivity?.(),
      cleanup,
    ]) {
      try {
        stop();
      } catch (error) {
        reportError(error instanceof Error ? error : new Error(String(error)));
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
    stopSubscriptions();
    await storage.close().catch(() => {});
    throw error;
  }

  scheduleFlush();

  return {
    track,
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
    async reset(...args: Parameters<Altertable['reset']>) {
      assertNotDisposed();
      core.reset(...args);
      await storage.flush();
    },
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
    flush: () => flush(),
    /** Wait for identity, consent, and event writes without making network requests. */
    flushPersistence() {
      assertNotDisposed();
      return storage.flush();
    },
    /** Stop timers/listeners and persist remaining events. Does not wait for network delivery. */
    dispose(): Promise<void> {
      if (!disposed) {
        disposed = true;
        stopSubscriptions();
      }

      return storage.close();
    },
  };
}
