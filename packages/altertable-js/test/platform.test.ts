import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPlatformRuntime as runtime } from '../../../test-utils/platformRuntime';
import { Altertable } from '../src';

const cleanups: Array<() => void> = [];

function deferred<T>() {
  return Promise.withResolvers<T>();
}

function init(
  client: Altertable,
  config: Parameters<Altertable['init']>[1] = {}
) {
  const cleanup = client.init('key', {
    persistence: 'memory',
    autoCapture: false,
    flushIntervalMs: 10_000,
    ...config,
  });
  cleanups.push(cleanup);
  return cleanup;
}

function payloads() {
  return vi
    .mocked(fetch)
    .mock.calls.flatMap(([, options]) => JSON.parse(options!.body as string));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('captures platform context before init and retains explicit null referrers', async () => {
  const host = runtime();
  const properties = { $os: 'native', screen: 'Home' };
  host.setContext({
    url: 'app://home',
    referrer: null,
    viewport: '400x800',
    properties,
  });
  const client = new Altertable(host.platform);
  client.track('Before Init');
  client.page('https://example.com/queued');
  properties.screen = 'Checkout';
  host.setContext({
    url: 'app://checkout',
    referrer: 'app://home',
    viewport: '800x400',
    properties,
  });
  init(client);
  client.track('After Init');
  await client.flush();
  expect(payloads()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'Before Init',
        properties: expect.objectContaining({
          $url: 'app://home',
          screen: 'Home',
          $os: 'native',
        }),
      }),
      expect.objectContaining({
        event: '$pageview',
        properties: expect.objectContaining({
          $url: 'https://example.com/queued',
          $referer: null,
          $viewport: '400x800',
          screen: 'Home',
        }),
      }),
      expect.objectContaining({
        event: 'After Init',
        properties: expect.objectContaining({
          $url: 'app://checkout',
          screen: 'Checkout',
        }),
      }),
    ])
  );
});

it('uses only the supplied capabilities even when running in a browser', async () => {
  const client = new Altertable({
    getContext: () => ({ properties: { runtime: 'worker' } }),
  });
  init(client, { autoCapture: true });
  window.dispatchEvent(new Event('popstate'));
  window.dispatchEvent(new Event('pagehide'));
  await vi.advanceTimersByTimeAsync(500);
  expect(fetch).not.toHaveBeenCalled();
  client.track('Worker Event');
  await client.flush();
  expect(payloads()).toEqual([
    expect.objectContaining({
      event: 'Worker Event',
      properties: expect.objectContaining({ $url: null, runtime: 'worker' }),
    }),
  ]);
});

it('tracks platform navigation, toggles capture, and disposes subscriptions', async () => {
  const host = runtime();
  host.setContext({ url: 'https://example.com/home' });
  const client = new Altertable(host.platform);
  const cleanup = init(client, { autoCapture: true });
  host.navigate('https://example.com/checkout');
  client.configure({ autoCapture: false });
  host.navigate('https://example.com/settings');
  await client.flush();
  expect(payloads().map(event => event.properties.$url)).toEqual([
    'https://example.com/home',
    'https://example.com/checkout',
  ]);
  expect(payloads()[1].properties.$referer).toBe('https://example.com/home');
  cleanup();
  host.navigate('https://example.com/logout');
  host.emit('active');
  await vi.advanceTimersByTimeAsync(20_000);
  expect(payloads()).toHaveLength(2);
});

it('flushes on platform connectivity recovery and backgrounding using normal transport', async () => {
  const host = runtime();
  host.setOnline(false);
  const client = new Altertable(host.platform);
  init(client, { flushEventThreshold: 1 });
  client.track('Offline');
  host.emit('inactive');
  await client.flush();
  expect(fetch).not.toHaveBeenCalled();
  host.setOnline(true);
  host.emit('online');
  await client.flush();
  client.configure({ flushEventThreshold: 20 });
  client.track('Background');
  host.emit('inactive');
  await client.flush();
  expect(payloads().map(event => event.event)).toEqual([
    'Offline',
    'Background',
  ]);
});

it('keeps arrivals during preparation in separately prepared snapshots', async () => {
  const host = runtime();
  const write = deferred<void>();
  host.platform.prepareDelivery = () => write.promise;
  const client = new Altertable(host.platform);
  init(client, { flushEventThreshold: 1 });
  client.track('First');
  client.track('Second');
  host.emit('inactive');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();
  write.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.map(([, options]) =>
        JSON.parse(options!.body as string).map(
          (event: { event: string }) => event.event
        )
      )
  ).toEqual([['First'], ['Second']]);
  expect(payloads().map(event => event.event)).toEqual(['First', 'Second']);
});

it('reports preparation failures and keeps events for a later attempt', async () => {
  const host = runtime();
  const error = new Error('Storage unavailable');
  let unavailable = true;
  host.platform.prepareDelivery = async () => {
    if (unavailable) throw error;
  };
  const errors: Error[] = [];
  const client = new Altertable(host.platform);
  init(client, {
    flushEventThreshold: 1,
    onError: error => errors.push(error),
  });
  client.track('Durable Event');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(errors).toEqual([error]);
  unavailable = false;
  host.emit('active');
  await vi.advanceTimersByTimeAsync(0);
  expect(payloads().map(event => event.event)).toEqual(['Durable Event']);
});

it.each(['cleanup', 'denial', 'reinitialize'] as const)(
  'does not send stale work after %s during delivery preparation',
  async action => {
    const host = runtime();
    const write = deferred<void>();
    host.platform.prepareDelivery = () => write.promise;
    const client = new Altertable(host.platform);
    const cleanup = init(client, { flushEventThreshold: 1 });
    client.track('Old Event');
    if (action === 'cleanup') cleanup();
    if (action === 'denial') client.configure({ trackingConsent: 'denied' });
    if (action === 'reinitialize') init(client);
    write.resolve();
    await vi.advanceTimersByTimeAsync(0);
    host.emit('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).not.toHaveBeenCalled();
  }
);

it('prepares each snapshot while an explicit flush drains newly collected events', async () => {
  const host = runtime();
  const response = deferred<Response>();
  const write = deferred<void>();
  let pendingWrite = false;
  host.platform.prepareDelivery = async () => {
    if (pendingWrite) await write.promise;
  };
  vi.mocked(fetch).mockReturnValueOnce(response.promise);
  const client = new Altertable(host.platform);
  init(client);
  client.track('First');
  const flushing = client.flush();
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  pendingWrite = true;
  client.track('Second');
  response.resolve({ ok: true } as Response);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  write.resolve();
  await flushing;
  expect(payloads().map(event => event.event)).toEqual(['First', 'Second']);
});

it.each(['accept', 'reject', 'throw', 'missing'] as const)(
  'uses the browser exit transport when beacon behavior is %s',
  async behavior => {
    const beacons: unknown[][] = [];
    vi.stubGlobal('navigator', {
      onLine: true,
      ...(behavior === 'missing'
        ? {}
        : {
            sendBeacon: (...args: unknown[]) => {
              beacons.push(args);
              if (behavior === 'throw') throw new Error('Beacon failed');
              return behavior === 'accept';
            },
          }),
    });
    const client = new Altertable();
    init(client);
    client.track('Exit Event');
    window.dispatchEvent(new Event('pagehide'));
    if (behavior === 'accept') {
      expect(fetch).not.toHaveBeenCalled();
      expect(beacons).toHaveLength(1);
      expect(beacons[0][0]).toBe('https://api.altertable.ai/track?apiKey=key');
    } else {
      expect(fetch).toHaveBeenCalledOnce();
      expect(vi.mocked(fetch).mock.calls[0][1]?.keepalive).toBe(true);
      expect(payloads().map(event => event.event)).toEqual(['Exit Event']);
    }
    window.dispatchEvent(new Event('pagehide'));
    expect(
      behavior === 'accept'
        ? beacons.length
        : vi.mocked(fetch).mock.calls.length
    ).toBe(1);
  }
);

it('retains queued calls and permits retry after a platform subscription fails', async () => {
  const host = runtime();
  const subscribe = host.platform.subscribeLifecycle!;
  let unavailable = true;
  host.platform.subscribeLifecycle = listener => {
    if (unavailable) throw new Error('Runtime unavailable');
    return subscribe(listener);
  };
  const client = new Altertable(host.platform);
  client.track('Before Startup');
  expect(() => init(client)).toThrow('Runtime unavailable');
  expect(() => client.flush()).toThrow('must be initialized');
  client.track('After Failed Startup');
  host.emit('online');
  await vi.advanceTimersByTimeAsync(20_000);
  expect(fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  unavailable = false;
  init(client);
  await client.flush();
  expect(payloads().map(event => event.event)).toEqual([
    'Before Startup',
    'After Failed Startup',
  ]);
});

it('continues cleanup and stops delivery when a platform cleanup throws', async () => {
  const host = runtime();
  host.setContext({ url: 'https://example.com/home' });
  const subscribe = host.platform.subscribeUrlChanges!;
  const error = new Error('Navigation cleanup failed');
  host.platform.subscribeUrlChanges = listener => {
    const unsubscribe = subscribe(listener);
    return () => {
      unsubscribe();
      throw error;
    };
  };
  const errors: Error[] = [];
  const client = new Altertable(host.platform);
  const cleanup = init(client, {
    autoCapture: true,
    onError: error => errors.push(error),
  });
  cleanup();
  expect(errors).toEqual([error]);
  expect(vi.getTimerCount()).toBe(0);
  host.emit('online');
  host.navigate('https://example.com/after-cleanup');
  await vi.advanceTimersByTimeAsync(20_000);
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps below-threshold events batched while an automatic request is in flight', async () => {
  const host = runtime();
  host.platform.prepareDelivery = async () => {};
  const response = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(response.promise);
  const client = new Altertable(host.platform);
  init(client);
  client.track('First');
  host.emit('inactive');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  client.track('Second');
  host.emit('active');
  await vi.advanceTimersByTimeAsync(0);
  response.resolve({ ok: true } as Response);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(payloads().map(event => event.event)).toEqual(['First', 'Second']);
});
