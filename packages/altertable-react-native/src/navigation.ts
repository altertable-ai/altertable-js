import type { ReactNativeClient } from './client';

/** Navigation methods used for screen tracking; accepts React Navigation container refs. */
export interface NavigationSource {
  isReady(): boolean;
  getCurrentRoute(): { key: string; name: string } | undefined;
  addListener(event: 'ready' | 'state', listener: () => void): () => void;
}

type ScreenClient = Pick<ReactNativeClient, 'screen'>;

// Effect cleanup removes listeners, but replay must retain the last visit.
// Weak keys keep this state scoped to the client and navigator lifetimes.
const lastRouteKeys = new WeakMap<
  NavigationSource,
  WeakMap<ScreenClient, string>
>();

/** Track the initial route and subsequent visits. Returns listener cleanup. */
export function trackNavigation(
  client: ScreenClient,
  navigation: NavigationSource
): () => void {
  const routeKeys =
    lastRouteKeys.get(navigation) ?? new WeakMap<ScreenClient, string>();
  lastRouteKeys.set(navigation, routeKeys);

  function trackCurrentRoute() {
    if (!navigation.isReady()) {
      return;
    }

    const route = navigation.getCurrentRoute();
    if (!route || route.key === routeKeys.get(client)) {
      return;
    }

    client.screen(route.name);
    routeKeys.set(client, route.key);
  }

  const removeReadyListener = navigation.addListener(
    'ready',
    trackCurrentRoute
  );
  const removeStateListener = navigation.addListener(
    'state',
    trackCurrentRoute
  );
  trackCurrentRoute();

  return () => {
    removeReadyListener();
    removeStateListener();
  };
}
