import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Altertable,
  type Platform,
  type PlatformLifecycleEvent,
} from '../packages/altertable-js/src';

export interface PlatformConformanceDriver {
  platform: Platform;
  homeUrl: string;
  navigate(url: string): void;
  setCleanupError(error?: Error): void;
  emitStale(event: PlatformLifecycleEvent): void;
  destroy(): void;
}

/** Reusable platform conformance tests for subscription ownership through SDK APIs. */
export function platformConformanceTests(
  name: string,
  createDriver: () => PlatformConformanceDriver
) {
  describe(`${name} platform conformance`, () => {
    let driver: PlatformConformanceDriver;
    let client: Altertable;
    let cleanup: (() => void) | undefined;
    const errors: Error[] = [];
    const config = {
      persistence: 'memory' as const,
      flushIntervalMs: 10_000,
      onError: (error: Error) => errors.push(error),
    };
    const events = () =>
      vi
        .mocked(fetch)
        .mock.calls.flatMap(([, options]) =>
          JSON.parse(options!.body as string)
        );
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      errors.length = 0;
      driver = createDriver();
      driver.navigate(driver.homeUrl);
      client = new Altertable(driver.platform);
    });
    afterEach(() => {
      driver.setCleanupError();
      cleanup?.();
      cleanup = undefined;
      driver.destroy();
      vi.restoreAllMocks();
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it.each([false, true])(
      'ignores retired URL subscriptions after reinitialization (cleanup fails=%s)',
      async fails => {
        cleanup = client.init('key', config);
        await client.flush();
        const error = new Error('Removal failed before detaching');
        driver.setCleanupError(fails ? error : undefined);
        cleanup = client.init('key', config);
        const destination = new URL('/checkout', driver.homeUrl).href;
        driver.navigate(destination);
        await client.flush();
        const visits = events().filter(
          event =>
            event.event === '$pageview' && event.properties.$url === destination
        );
        expect(visits).toEqual([
          expect.objectContaining({
            properties: expect.objectContaining({ $referer: driver.homeUrl }),
          }),
        ]);
        if (fails) expect(errors).toContain(error);
      }
    );

    it.each([false, true])(
      'invalidates capture before disabling and reenabling it (cleanup fails=%s)',
      async fails => {
        cleanup = client.init('key', config);
        await client.flush();
        driver.setCleanupError(
          fails ? new Error('Removal failed before detaching') : undefined
        );
        expect(() => client.configure({ autoCapture: false })).not.toThrow();
        const ignored = new URL('/ignored', driver.homeUrl).href;
        driver.navigate(ignored);
        await client.flush();
        expect(events().some(event => event.properties.$url === ignored)).toBe(
          false
        );
        client.configure({ autoCapture: true });
        const destination = new URL('/checkout', driver.homeUrl).href;
        driver.navigate(destination);
        await client.flush();
        expect(
          events().filter(event => event.properties.$url === destination)
        ).toHaveLength(1);
      }
    );

    it.each([false, true])(
      'ignores late lifecycle callbacks from a retired subscription (cleanup fails=%s)',
      async fails => {
        cleanup = client.init('key', { ...config, autoCapture: false });
        driver.setCleanupError(
          fails ? new Error('Removal failed before detaching') : undefined
        );
        cleanup = client.init('key', { ...config, autoCapture: false });
        client.track('New Owner');
        driver.emitStale('online');
        await vi.advanceTimersByTimeAsync(0);
        expect(fetch).not.toHaveBeenCalled();
        await client.flush();
        expect(events().map(event => event.event)).toEqual(['New Owner']);
      }
    );
  });
}
