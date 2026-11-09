import { getStorageKeys } from '@altertable/altertable-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createAltertable,
  type ReactNativeClient,
  type ReactNativeConfig,
} from '../src';
import { createAsyncStorageMock, deferred } from './helpers';
import { appStateListenerCount, emitAppState } from './reactNativeMock';

const clients: ReactNativeClient[] = [];
async function create(options: ReactNativeConfig = { mode: 'audience' }) {
  const client = await createAltertable('key', {
    flushIntervalMs: 1_000_000,
    ...options,
  });
  clients.push(client);
  return client;
}
function payloads() {
  return vi
    .mocked(fetch)
    .mock.calls.flatMap(([, options]) => JSON.parse(options!.body as string));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  vi.clearAllMocks();
});
afterEach(async () => {
  for (const client of clients.splice(0)) await client.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('tracks audience screens without storage and applies policy after transforms', async () => {
  const properties = { nested: { environment: 'business' } };
  const client = await create({
    mode: 'audience',
    transformEvent: event => ({
      ...event,
      distinct_id: 'injected-user',
      anonymous_id: 'anonymous-injected',
      device_id: 'device-injected',
      environment: 'injected-environment',
      properties: {
        ...event.properties,
        $url: 'https://user:pass@example.com/docs?secret=value#fragment',
        $referer: 'https://search.example/private?secret=value',
        $viewport: '100x200',
      },
    }),
  });
  client.identify('');
  client.alias('');
  client.updateTraits({ email: 'private@example.com' });
  client.screen('Home', { properties });
  await client.flush();
  expect(payloads()).toEqual([
    {
      mode: 'audience',
      event: '$screen',
      timestamp: expect.any(String),
      properties: expect.objectContaining({
        nested: { environment: 'business' },
        $view_name: 'Home',
        $view_type: 'screen',
        $os: 'ios',
        $url: 'https://example.com/docs',
        $referer: 'https://search.example',
      }),
    },
  ]);
  expect(payloads()[0].properties).not.toHaveProperty('$viewport');
  expect(properties).toEqual({ nested: { environment: 'business' } });
  expect(fetch).toHaveBeenCalledWith(
    'https://api.altertable.ai/track?apiKey=key',
    expect.objectContaining({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
    })
  );
});

it('never reads or migrates product storage, even when persistence is requested', async () => {
  const storage = createAsyncStorageMock();
  const keys = getStorageKeys('key');
  storage.values.set(
    keys.session,
    JSON.stringify({ distinctId: 'saved-user', trackingConsent: 'denied' })
  );
  storage.values.set(keys.events, '[{"event":"Saved Product"}]');
  storage.values.set('atbl.key.staging', 'legacy identity');
  storage.values.set('atbl.key.staging.events', 'legacy events');
  const before = new Map(storage.values);
  const client = await create({
    mode: 'audience',
    storage,
    eventPersistence: true,
    environment: 'staging',
  });
  expect(client.getTrackingConsent()).toBe('granted');
  client.track('Audience');
  await client.reset();
  client.track('After Reset');
  await client.flushPersistence();
  await client.flush();
  await client.dispose();
  expect(payloads().map(p => p.event)).toEqual(['After Reset']);
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
  expect(storage.values).toEqual(before);
});

it.each(['pending', 'dismissed'] as const)(
  'keeps %s audience events in memory until consent and connectivity permit delivery',
  async trackingConsent => {
    let online: (state: {
      isConnected: boolean;
      isInternetReachable: boolean;
    }) => void;
    const unsubscribe = vi.fn();
    const client = await create({
      mode: 'audience',
      trackingConsent,
      connectivity: {
        addEventListener(listener) {
          online = listener;
          listener({ isConnected: false, isInternetReachable: false });
          return unsubscribe;
        },
      },
    });
    client.track('Buffered');
    emitAppState('background');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).not.toHaveBeenCalled();
    await client.configure({ trackingConsent: 'granted' });
    expect(fetch).not.toHaveBeenCalled();
    online!({ isConnected: true, isInternetReachable: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(payloads().map(p => p.event)).toEqual(['Buffered']);
    await client.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(appStateListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('drops denied events and never restores audience consent or queues in a replacement client', async () => {
  const first = await create({ mode: 'audience', trackingConsent: 'pending' });
  first.track('Before Denial');
  await first.configure({ trackingConsent: 'denied' });
  first.track('Denied');
  await first.configure({ trackingConsent: 'granted' });
  await first.flush();
  expect(fetch).not.toHaveBeenCalled();
  first.track('Before Disposal');
  await first.dispose();
  const second = await create();
  expect(second.getTrackingConsent()).toBe('granted');
  second.track('Replacement');
  await second.flush();
  expect(payloads().map(p => p.event)).toEqual(['Replacement']);
});

it('rejects a mode change before applying consent or error-handler changes', async () => {
  const client = await create({ mode: 'audience', trackingConsent: 'pending' });
  client.track('Buffered');
  const onError = vi.fn();
  await expect(
    client.configure({
      // @ts-expect-error Exercise an immutable option from an untyped caller.
      mode: 'product',
      trackingConsent: 'granted',
      onError,
    })
  ).rejects.toThrow('new client');
  expect(client.getTrackingConsent()).toBe('pending');
  expect(fetch).not.toHaveBeenCalled();
  await client.configure({ trackingConsent: 'granted' });
  await client.flush();
  expect(payloads().map(p => p.event)).toEqual(['Buffered']);
  expect(payloads()[0].mode).toBe('audience');
  expect(onError).not.toHaveBeenCalled();
});

it.each(['denial', 'disposal'] as const)(
  'does not resume audience delivery after %s during an in-flight request',
  async action => {
    const response = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(response.promise);
    const client = await create({ mode: 'audience', flushEventThreshold: 1 });
    client.track('In Flight');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledOnce();
    client.track('Never Send');
    if (action === 'denial')
      await client.configure({ trackingConsent: 'denied' });
    else await client.dispose();
    response.resolve({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      json: async () => ({}),
    } as Response);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledOnce();
  }
);
