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

type CoreOptions = Omit<
  AltertableConfig,
  'adapters' | 'autoCapture' | 'persistence' | 'eventPersistence' | 'isOnline'
>;
export type ReactNativeConfig = CoreOptions & {
  storage: AsyncStorage;
  /** Persist unsent events. Defaults to true. Identity and consent remain durable. */
  eventPersistence?: boolean;
  connectivity?: Connectivity;
};

export type ReactNativeConfigUpdates = Pick<
  CoreOptions,
  | 'trackingConsent'
  | 'debug'
  | 'release'
  | 'onError'
  | 'transformEvent'
  | 'flushEventThreshold'
  | 'flushIntervalMs'
  | 'maxBatchSize'
>;

export type ScreenOptions = { id?: string; properties?: EventProperties };
export type ReactNativeClient = Awaited<ReturnType<typeof createAltertable>>;

/** Restore identity, consent, and buffered events before exposing a ready client. */
export async function createAltertable(
  apiKey: string,
  options: ReactNativeConfig
) {
  if (!apiKey) throw new Error('Missing API key');
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
  if (!eventPersistence) storage.removeItem(keys.events);
  const core = new Altertable();
  let deliveryEnabled = false;
  let disposed = false;
  let online = true;
  const cleanup = core.init(apiKey, {
    ...config,
    autoCapture: false,
    persistence: storage,
    eventPersistence: eventPersistence ? storage : false,
    flushIntervalMs: config.flushIntervalMs ?? 10_000,
    isOnline: () =>
      deliveryEnabled &&
      !disposed &&
      online &&
      core.getTrackingConsent() === TrackingConsent.GRANTED,
    onError: reportError,
  });

  function assertOpen() {
    if (disposed) throw new Error('The Altertable client has been disposed.');
  }

  function track(event: string, properties: EventProperties = {}) {
    assertOpen();
    core.track(event, {
      $os: Platform.OS,
      $os_version: String(Platform.Version),
      ...properties,
      $lib: __LIB__,
      $lib_version: __LIB_VERSION__,
    });
  }

  async function flush() {
    assertOpen();
    // Persist first: background network attempts must not delay native writes.
    await storage.flush();
    if (disposed) return;
    deliveryEnabled = true;
    await core.flush();
    await storage.flush();
  }

  function scheduleFlush() {
    // Core delivery and storage already report their errors through onError.
    void flush().catch(() => {});
  }

  let appStateSubscription:
    | ReturnType<typeof AppState.addEventListener>
    | undefined;
  let unsubscribeConnectivity: (() => void) | undefined;
  try {
    await storage.flush();
    deliveryEnabled = true;
    appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active' || state === 'inactive' || state === 'background')
        scheduleFlush();
    });
    unsubscribeConnectivity = connectivity?.addEventListener(state => {
      const wasOnline = online;
      online =
        state.isConnected !== false && state.isInternetReachable !== false;
      if (online && !wasOnline) scheduleFlush();
    });
  } catch (error) {
    disposed = true;
    appStateSubscription?.remove();
    cleanup();
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
      assertOpen();
      core.identify(...args);
    },
    alias(...args: Parameters<Altertable['alias']>) {
      assertOpen();
      core.alias(...args);
    },
    updateTraits(...args: Parameters<Altertable['updateTraits']>) {
      assertOpen();
      core.updateTraits(...args);
    },
    getTrackingConsent: () => core.getTrackingConsent(),
    async reset(...args: Parameters<Altertable['reset']>) {
      assertOpen();
      core.reset(...args);
      await storage.flush();
    },
    async configure(updates: ReactNativeConfigUpdates) {
      assertOpen();
      // A consent grant can synchronously replay and flush queued events in
      // core. Keep delivery paused until the updated consent is durable.
      const grantingConsent =
        updates.trackingConsent === TrackingConsent.GRANTED;
      if (grantingConsent) deliveryEnabled = false;
      if ('onError' in updates) onError = updates.onError;
      core.configure({ ...updates, onError: reportError });
      await storage.flush();
      if (grantingConsent && !disposed) {
        deliveryEnabled = true;
        scheduleFlush();
      }
    },
    flush,
    /** Wait for identity, consent, and event writes without making network requests. */
    flushPersistence() {
      assertOpen();
      return storage.flush();
    },
    /** Stop timers/listeners and persist remaining events. Does not wait for network delivery. */
    dispose(): Promise<void> {
      if (!disposed) {
        disposed = true;
        appStateSubscription?.remove();
        unsubscribeConnectivity?.();
        cleanup();
      }
      return storage.close();
    },
  };
}
