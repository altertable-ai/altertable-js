// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { expect, it, vi } from 'vitest';

import { trackNavigation, type NavigationSource } from '../src/navigation';

function createNavigation(ready = true) {
  let route: { key: string; name: string } | undefined = {
    key: 'home-1',
    name: 'Home',
  };
  const listeners = {
    ready: new Set<() => void>(),
    state: new Set<() => void>(),
  };
  const navigation: NavigationSource = {
    isReady: () => ready,
    getCurrentRoute: () => route,
    addListener(event, listener) {
      listeners[event].add(listener);
      return () => {
        listeners[event].delete(listener);
      };
    },
  };
  return {
    navigation,
    setRoute(nextRoute: typeof route) {
      route = nextRoute;
      for (const listener of listeners.state) listener();
    },
    setReady() {
      ready = true;
      for (const listener of listeners.ready) listener();
    },
  };
}

it('tracks the initial screen after ready and deduplicates repeated state events', () => {
  const ref = createNavigation(false);
  const screen = vi.fn();
  const cleanup = trackNavigation({ screen }, ref.navigation);
  expect(screen).not.toHaveBeenCalled();
  ref.setReady();
  ref.setRoute({ key: 'home-1', name: 'Home' });
  expect(screen.mock.calls).toEqual([['Home']]);
  cleanup();
});

it('tracks navigation back to mounted screens and new instances with the same name', () => {
  const ref = createNavigation();
  const screen = vi.fn();
  const cleanup = trackNavigation({ screen }, ref.navigation);
  ref.setRoute({ key: 'checkout-1', name: 'Checkout' });
  ref.setRoute({ key: 'home-1', name: 'Home' });
  ref.setRoute({ key: 'home-2', name: 'Home' });
  expect(screen.mock.calls).toEqual([
    ['Home'],
    ['Checkout'],
    ['Home'],
    ['Home'],
  ]);
  cleanup();
  ref.setRoute({ key: 'next', name: 'Next' });
  expect(screen).toHaveBeenCalledTimes(4);
});

it('ignores a ready navigator without a current route', () => {
  const ref = createNavigation();
  ref.setRoute(undefined);
  const screen = vi.fn();
  const cleanup = trackNavigation({ screen }, ref.navigation);
  expect(screen).not.toHaveBeenCalled();
  cleanup();
});

it('preserves the last visit across effect replay without suppressing revisits', () => {
  const ref = createNavigation();
  const client = { screen: vi.fn() };
  const cleanup = trackNavigation(client, ref.navigation);
  cleanup();
  const replayCleanup = trackNavigation(client, ref.navigation);
  expect(client.screen.mock.calls).toEqual([['Home']]);

  ref.setRoute({ key: 'checkout-1', name: 'Checkout' });
  ref.setRoute({ key: 'home-1', name: 'Home' });
  expect(client.screen.mock.calls).toEqual([['Home'], ['Checkout'], ['Home']]);
  replayCleanup();

  const otherClient = { screen: vi.fn() };
  trackNavigation(otherClient, ref.navigation)();
  expect(otherClient.screen).toHaveBeenCalledWith('Home');
});

it('tracks a single initial visit when React Strict Mode replays the effect', () => {
  const ref = createNavigation();
  const client = { screen: vi.fn() };
  const { unmount } = renderHook(
    () => {
      useEffect(() => trackNavigation(client, ref.navigation), []);
    },
    { wrapper: StrictMode }
  );

  expect(client.screen.mock.calls).toEqual([['Home']]);
  ref.setRoute({ key: 'checkout-1', name: 'Checkout' });
  ref.setRoute({ key: 'home-1', name: 'Home' });
  expect(client.screen.mock.calls).toEqual([['Home'], ['Checkout'], ['Home']]);
  unmount();
  ref.setRoute({ key: 'another', name: 'Another' });
  expect(client.screen).toHaveBeenCalledTimes(3);
});
