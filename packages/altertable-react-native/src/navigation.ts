import type { ReactNativeClient } from './client';

/** The public subset shared by React Navigation's static and dynamic refs. */
export interface NavigationRef {
  isReady(): boolean;
  getCurrentRoute(): { key: string; name: string } | undefined;
  addListener(event: 'ready' | 'state', listener: () => void): () => void;
}

type ScreenClient = Pick<ReactNativeClient, 'screen'>;

// Effect cleanup removes listeners, but replay must retain the last visit.
// Weak keys keep this state scoped to the client and navigator lifetimes.
const lastRouteKeys = new WeakMap<
  NavigationRef,
  WeakMap<ScreenClient, string>
>();

/** Track the initial route and subsequent visits. Returns listener cleanup. */
export function trackNavigation(
  client: ScreenClient,
  navigation: NavigationRef
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
