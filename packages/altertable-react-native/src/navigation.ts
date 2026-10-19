import type { ReactNativeClient } from './client';

/** Navigation methods used for screen tracking; accepts React Navigation container refs. */
export interface NavigationSource {
  isReady(): boolean;
  getCurrentRoute(): { key: string; name: string } | undefined;
  addListener(event: 'ready' | 'state', listener: () => void): () => void;
}

type ScreenClient = Pick<ReactNativeClient, 'screen'>;

// Keep the last visit across effect replay without retaining the client or navigator.
const lastRouteKeys = new WeakMap<
  NavigationSource,
  WeakMap<ScreenClient, string>
>();

/** Track initial and subsequent visits. Cleanup invalidates callbacks before removing listeners. */
export function trackNavigation(
  client: ScreenClient,
  navigation: NavigationSource
): () => void {
  const routeKeys =
    lastRouteKeys.get(navigation) ?? new WeakMap<ScreenClient, string>();
  lastRouteKeys.set(navigation, routeKeys);

  let active = true;
  let removeReadyListener: (() => void) | undefined;
  let removeStateListener: (() => void) | undefined;

  function trackCurrentRoute() {
    if (!active || !navigation.isReady()) {
      return;
    }

    const route = navigation.getCurrentRoute();
    if (!route || route.key === routeKeys.get(client)) {
      return;
    }

    client.screen(route.name);
    routeKeys.set(client, route.key);
  }

  function cleanup() {
    if (!active) return;
    active = false;
    try {
      removeReadyListener?.();
    } finally {
      removeStateListener?.();
    }
  }

  try {
    removeReadyListener = navigation.addListener('ready', trackCurrentRoute);
    removeStateListener = navigation.addListener('state', trackCurrentRoute);
    trackCurrentRoute();
  } catch (error) {
    try {
      cleanup();
    } catch {
      // Preserve the setup failure after attempting every available removal.
    }
    throw error;
  }

  return cleanup;
}
