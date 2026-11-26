import type { Platform, TrackingMode } from '@altertable/altertable-js';
import {
  createWarningLogger,
  PROPERTY_LIB,
  PROPERTY_LIB_VERSION,
  toError,
} from '@altertable/altertable-shared';
import { AppState, Platform as ReactNativePlatform } from 'react-native';

/** Structurally compatible with @react-native-community/netinfo. */
export interface Connectivity {
  addEventListener(
    listener: (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => void
  ): () => void;
}

/** @internal Compose React Native runtime capabilities for createAltertable. */
export function createReactNativePlatform({
  mode,
  connectivity,
  prepareDelivery,
  onError,
}: {
  mode: TrackingMode;
  connectivity?: Connectivity;
  prepareDelivery: () => Promise<boolean>;
  onError: (error: Error) => void;
}): Platform {
  const logger = createWarningLogger('Altertable React Native');
  let online = true;
  return {
    getContext: () => ({
      properties: {
        // Audience measurement must not attach automatic OS or device details.
        ...(mode === 'product' && {
          $os: ReactNativePlatform.OS,
          $os_version: String(ReactNativePlatform.Version),
        }),
        [PROPERTY_LIB]: __LIB__,
        [PROPERTY_LIB_VERSION]: __LIB_VERSION__,
      },
    }),
    isOnline: () => online,
    prepareDelivery,
    subscribeLifecycle(listener) {
      const runCleanup = (cleanup: () => void) => {
        try {
          cleanup();
        } catch (error) {
          const sourceError = toError(error);
          logger.warnOnce(
            'Failed to remove a native subscription. Remaining cleanup will continue.',
            sourceError
          );
          onError(sourceError);
        }
      };
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') listener('active');
        else if (state === 'inactive' || state === 'background')
          listener('inactive');
      });
      let unsubscribeConnectivity: (() => void) | undefined;
      try {
        unsubscribeConnectivity = connectivity?.addEventListener(state => {
          const wasOnline = online;
          online =
            state.isConnected !== false && state.isInternetReachable !== false;
          if (online && !wasOnline) listener('online');
        });
      } catch (error) {
        runCleanup(() => subscription.remove());
        throw error;
      }
      return () => {
        runCleanup(() => subscription.remove());
        runCleanup(() => unsubscribeConnectivity?.());
      };
    },
  };
}
