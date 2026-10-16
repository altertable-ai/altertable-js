import type { ReactNativeClient } from './client';

/** The public subset shared by React Navigation's static and dynamic refs. */
export interface NavigationRef {
  isReady(): boolean;
  getCurrentRoute(): { key: string; name: string } | undefined;
  addListener(event: 'ready' | 'state', listener: () => void): () => void;
}

/** Track the initial route and subsequent visits. Returns listener cleanup. */
export function trackNavigation(
  client: Pick<ReactNativeClient, 'screen'>,
  navigation: NavigationRef
): () => void {
  let previousKey: string | undefined;
  function trackCurrentRoute() {
    if (!navigation.isReady()) return;
    const route = navigation.getCurrentRoute();
    if (!route || route.key === previousKey) return;
    previousKey = route.key;
    client.screen(route.name);
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
