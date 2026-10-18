import type { Platform } from '@altertable/altertable-js';
import { AppState, Platform as ReactNativePlatform } from 'react-native';

import { createLogger } from './logger';

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
  connectivity,
  prepareDelivery,
  onError,
}: {
  connectivity?: Connectivity;
  prepareDelivery: () => Promise<boolean>;
  onError: (error: Error) => void;
}): Platform {
  const logger = createLogger();
  let online = true;
  return {
    getContext: () => ({
      properties: {
        $os: ReactNativePlatform.OS,
        $os_version: String(ReactNativePlatform.Version),
        $lib: __LIB__,
        $lib_version: __LIB_VERSION__,
      },
    }),
    isOnline: () => online,
    prepareDelivery,
    subscribeLifecycle(listener) {
      const stop = (cleanup: () => void) => {
        try {
          cleanup();
        } catch (error) {
          const sourceError =
            error instanceof Error ? error : new Error(String(error));
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
        stop(() => subscription.remove());
        throw error;
      }
      return () => {
        stop(() => subscription.remove());
        stop(() => unsubscribeConnectivity?.());
      };
    },
  };
}
