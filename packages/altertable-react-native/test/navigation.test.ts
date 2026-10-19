// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { expect, it, vi } from 'vitest';

import {
  createAltertable,
  trackNavigation,
  type NavigationSource,
} from '../src';
import { createAsyncStorageMock } from './helpers';

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

it.each(['ready', 'state'] as const)(
  'invalidates navigation before a %s listener removal throws and attempts both removals',
  async failedEvent => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const client = await createAltertable('key', {
      storage: createAsyncStorageMock(),
    });
    try {
      const ref = createNavigation();
      const removals: string[] = [];
      const failure = new Error('Unsubscribe failed');
      const navigation: NavigationSource = {
        ...ref.navigation,
        addListener(event, listener) {
          const remove = ref.navigation.addListener(event, listener);
          return () => {
            removals.push(event);
            if (event === failedEvent) throw failure;
            remove();
          };
        },
      };
      const cleanup = trackNavigation(client, navigation);
      await client.flush();
      expect(fetch).toHaveBeenCalledOnce();
      expect(() => cleanup()).toThrow(failure);
      expect(removals).toEqual(['ready', 'state']);
      await client.dispose();
      expect(() => {
        ref.setRoute({ key: 'later', name: 'Later' });
        ref.setReady();
        cleanup();
      }).not.toThrow();
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      await client.dispose();
      vi.unstubAllGlobals();
    }
  }
);

it.each(['ready', 'state'] as const)(
  'invalidates partially registered navigation when %s subscription setup throws',
  async failedEvent => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const client = await createAltertable('key', {
      storage: createAsyncStorageMock(),
    });
    try {
      const ref = createNavigation();
      const removals: string[] = [];
      const failure = new Error('Subscribe failed');
      const navigation: NavigationSource = {
        ...ref.navigation,
        addListener(event, listener) {
          ref.navigation.addListener(event, listener);
          // A dependency may attach before failing to return its cleanup handle.
          if (event === failedEvent) throw failure;
          return () => {
            removals.push(event);
            throw new Error('Removal failed before detachment');
          };
        },
      };
      expect(() => trackNavigation(client, navigation)).toThrow(failure);
      expect(removals).toEqual(failedEvent === 'state' ? ['ready'] : []);
      await client.dispose();
      expect(() => {
        ref.setRoute({ key: 'later', name: 'Later' });
        ref.setReady();
      }).not.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await client.dispose();
      vi.unstubAllGlobals();
    }
  }
);
