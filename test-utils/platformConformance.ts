import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Altertable } from '../packages/altertable-js/src/core';
import type {
  Platform,
  PlatformLifecycleEvent,
} from '../packages/altertable-js/src/platform/types';
import { lifecycleOwnershipConformanceTests } from './platformLifecycleConformance';

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
  createDriver: () => PlatformConformanceDriver,
  createClient: (
    platform: Platform
  ) => Pick<Altertable, 'init' | 'configure' | 'track' | 'flush'>
) {
  describe(`${name} platform conformance`, () => {
    let driver: PlatformConformanceDriver;
    let client: Pick<Altertable, 'init' | 'configure' | 'track' | 'flush'>;
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
      client = createClient(driver.platform);
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
      'retries failed autocapture registration without duplicate views (attached before failure=%s)',
      async attachedBeforeFailure => {
        cleanup = client.init('key', { ...config, autoCapture: false });
        const subscribe = driver.platform.subscribeUrlChanges!.bind(
          driver.platform
        );
        const failure = new Error('Temporary navigation subscription failure');
        const registration = vi
          .spyOn(driver.platform, 'subscribeUrlChanges')
          .mockImplementationOnce(listener => {
            if (attachedBeforeFailure) subscribe(listener);
            throw failure;
          });
        expect(() => client.configure({ autoCapture: true })).toThrow(failure);
        const checkout = new URL('/checkout', driver.homeUrl).href;
        driver.navigate(checkout);
        await client.flush();
        expect(events()).toEqual([]);

        client.configure({ autoCapture: true });
        client.configure({ autoCapture: true });
        await vi.advanceTimersByTimeAsync(1_500);
        await client.flush();
        expect(registration).toHaveBeenCalledTimes(2);
        expect(events().map(event => event.properties.$url)).toEqual([
          checkout,
        ]);
        const confirmation = new URL('/confirmation', driver.homeUrl).href;
        driver.navigate(confirmation);
        await client.flush();
        expect(events().map(event => event.properties.$url)).toEqual([
          checkout,
          confirmation,
        ]);
        expect(events().at(-1).properties.$referer).toBe(checkout);
      }
    );

    it.each([false, true])(
      'captures the current URL when enabling capture (initially enabled=%s)',
      async initiallyEnabled => {
        cleanup = client.init('key', {
          ...config,
          autoCapture: initiallyEnabled,
        });
        client.configure({ autoCapture: false });
        const checkout = new URL('/checkout', driver.homeUrl).href;
        driver.navigate(checkout);
        client.configure({ autoCapture: true });
        await vi.advanceTimersByTimeAsync(1_500);
        await client.flush();
        expect(events().map(event => event.properties.$url)).toEqual(
          initiallyEnabled ? [driver.homeUrl, checkout] : [checkout]
        );
        expect(events().at(-1).properties.$referer).toBe(driver.homeUrl);
        const confirmation = new URL('/confirmation', driver.homeUrl).href;
        driver.navigate(confirmation);
        await client.flush();
        expect(events().at(-1).properties).toMatchObject({
          $url: confirmation,
          $referer: checkout,
        });
      }
    );

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

    lifecycleOwnershipConformanceTests(async () => {
      cleanup = client.init('key', { ...config, autoCapture: false });
      return {
        retire: () => cleanup!(),
        replace() {
          cleanup = client.init('key', { ...config, autoCapture: false });
          return client;
        },
        setCleanupError: error => driver.setCleanupError(error),
        emitStale: () => driver.emitStale('online'),
      };
    });
  });
}
