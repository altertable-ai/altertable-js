import { getStorageKeys } from '@altertable/altertable-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createAltertable,
  type Connectivity,
  type ReactNativeClient,
} from '../src';
import { createBackend, deferred } from './helpers';
import { appStateListenerCount, emitAppState } from './reactNativeMock';

const clients: ReactNativeClient[] = [];
const keys = getStorageKeys('key');
const backend = createBackend();
let connectivityListener: (state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) => void;
const unsubscribeConnectivity = vi.fn();
const connectivity: Connectivity = {
  addEventListener(listener) {
    connectivityListener = listener;
    listener({ isConnected: false, isInternetReachable: false });
    return unsubscribeConnectivity;
  },
};
async function create(
  options: Partial<Parameters<typeof createAltertable>[1]> = {}
) {
  const client = await createAltertable('key', {
    storage: backend,
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
  backend.values.clear();
  vi.clearAllMocks();
});
afterEach(async () => {
  for (const client of clients.splice(0)) await client.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('restores anonymous identity, identified identity, and unsent events across restarts', async () => {
  const first = await create({ connectivity });
  first.track('Before Login');
  await first.flushPersistence();
  const anonymous = JSON.parse(backend.values.get(keys.session)!);
  first.identify('user-123');
  first.track('Before Restart');
  await first.dispose();

  const second = await create();
  second.track('After Restart');
  await second.flush();
  expect(payloads()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'Before Login',
        distinct_id: anonymous.distinctId,
      }),
      expect.objectContaining({
        event: 'Before Restart',
        distinct_id: 'user-123',
        anonymous_id: anonymous.distinctId,
      }),
      expect.objectContaining({
        event: 'After Restart',
        distinct_id: 'user-123',
        device_id: anonymous.deviceId,
      }),
    ])
  );
  expect(backend.values.has(keys.events)).toBe(false);
});

it('does not expose a client before identity hydration completes', async () => {
  const read = deferred<string | null>();
  const isolatedBackend = createBackend();
  isolatedBackend.getItem.mockReturnValue(read.promise);
  const result = create({ storage: isolatedBackend });
  let ready = false;
  void result.then(() => {
    ready = true;
    return;
  });
  await Promise.resolve();
  expect(ready).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  read.resolve(null);
  await result;
  expect(ready).toBe(true);
});

it('restores denied consent and removes previously buffered events before sending', async () => {
  const first = await create({ connectivity });
  first.track('Queued Before Denial');
  await first.flushPersistence();
  await first.dispose();
  const session = JSON.parse(backend.values.get(keys.session)!);
  backend.values.set(
    keys.session,
    JSON.stringify({ ...session, trackingConsent: 'denied' })
  );

  const second = await create();
  second.track('Denied');
  await second.flush();
  expect(second.getTrackingConsent()).toBe('denied');
  expect(fetch).not.toHaveBeenCalled();
  expect(backend.values.has(keys.events)).toBe(false);
  await second.configure({ trackingConsent: 'granted' });
  second.track('Allowed');
  await second.flush();
  expect(
    payloads()
      .filter(payload => payload.event)
      .map(payload => payload.event)
  ).toEqual(['Allowed']);
});

it('keeps pending consent events in memory until grant and durably clears on denial', async () => {
  const client = await create({ trackingConsent: 'pending', connectivity });
  client.track('Pending');
  await client.flushPersistence();
  expect(backend.values.has(keys.events)).toBe(false);
  await client.configure({ trackingConsent: 'granted' });
  expect(backend.values.get(keys.events)).toContain('Pending');
  await client.configure({ trackingConsent: 'denied' });
  expect(backend.values.has(keys.events)).toBe(false);
  expect(JSON.parse(backend.values.get(keys.session)!)).toMatchObject({
    trackingConsent: 'denied',
  });
});

it('can disable durable events while retaining identity and consent', async () => {
  const first = await create({ connectivity });
  first.track('Old Buffered Event');
  await first.dispose();
  const second = await create({ connectivity, eventPersistence: false });
  second.track('Memory Only');
  await second.flushPersistence();
  expect(backend.values.has(keys.events)).toBe(false);
  expect(backend.values.has(keys.session)).toBe(true);
});

it('flushes on connectivity recovery and app state transitions, then cleans up', async () => {
  const client = await create({ connectivity });
  client.track('Offline');
  await client.flush();
  expect(fetch).not.toHaveBeenCalled();
  connectivityListener({ isConnected: true, isInternetReachable: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(payloads()).toEqual(
    expect.arrayContaining([expect.objectContaining({ event: 'Offline' })])
  );
  for (const state of ['background', 'inactive', 'active'] as const) {
    client.track(state);
    emitAppState(state);
    await vi.advanceTimersByTimeAsync(0);
    expect(payloads()).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: state })])
    );
  }
  await client.dispose();
  expect(appStateListenerCount()).toBe(0);
  expect(unsubscribeConnectivity).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(() => client.track('Disposed')).toThrow('disposed');
});

it('persists reset before resolving and keeps device identity and consent', async () => {
  const client = await create({ connectivity });
  client.identify('user-123');
  client.track('Old User');
  await client.flushPersistence();
  const before = JSON.parse(backend.values.get(keys.session)!);
  await client.reset();
  const after = JSON.parse(backend.values.get(keys.session)!);
  expect(after.deviceId).toBe(before.deviceId);
  expect(after.distinctId).not.toBe(before.distinctId);
  expect(after.trackingConsent).toBe(before.trackingConsent);
  expect(backend.values.has(keys.events)).toBe(false);
});

it('records native screen properties and metadata', async () => {
  const client = await create();
  client.screen('Checkout', { id: 'order-1', properties: { total: 42 } });
  await client.flush();
  expect(payloads()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: '$screen',
        properties: expect.objectContaining({
          $view_name: 'Checkout',
          $view_id: 'order-1',
          $view_type: 'screen',
          $os: 'ios',
          total: 42,
        }),
      }),
    ])
  );
});

it('keeps in-flight events durable when disposed and ignores late request completion', async () => {
  const response = deferred<{ ok: boolean }>();
  vi.mocked(fetch).mockReturnValue(response.promise as Promise<Response>);
  const client = await create({ flushEventThreshold: 1 });
  client.track('In Flight');
  await client.dispose();
  expect(backend.values.get(keys.events)).toContain('In Flight');
  const next = await create({ connectivity });
  next.track('Next Client');
  await next.flushPersistence();
  response.resolve({ ok: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(backend.values.get(keys.events)).toContain('Next Client');
});

it('rejects startup on storage failure and leaves no timers or listeners', async () => {
  const isolatedBackend = createBackend();
  isolatedBackend.setItem.mockRejectedValue(new Error('Disk full'));
  await expect(create({ storage: isolatedBackend })).rejects.toThrow(
    'Disk full'
  );
  expect(vi.getTimerCount()).toBe(0);
  expect(appStateListenerCount()).toBe(0);
});

it('waits for durable consent before delivering events queued under pending consent', async () => {
  const client = await create({ trackingConsent: 'pending' });
  client.track('Pending');
  const write = deferred<void>();
  backend.setItem.mockImplementationOnce(async (key, value) => {
    await write.promise;
    backend.values.set(key, value);
  });
  const grant = client.configure({ trackingConsent: 'granted' });
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
  write.resolve();
  await grant;
  await client.flush();
  expect(payloads()).toEqual(
    expect.arrayContaining([expect.objectContaining({ event: 'Pending' })])
  );
});

it('does not deliver a consent grant when its native write fails', async () => {
  const client = await create({ trackingConsent: 'pending' });
  client.track('Pending');
  backend.setItem.mockRejectedValueOnce(new Error('Disk full'));
  await expect(
    client.configure({ trackingConsent: 'granted' })
  ).rejects.toThrow('Disk full');
  await vi.advanceTimersByTimeAsync(1_000_000);
  expect(fetch).not.toHaveBeenCalled();
  await client.flush();
  expect(payloads()).toEqual(
    expect.arrayContaining([expect.objectContaining({ event: 'Pending' })])
  );
});

it('reports read failures without generating a replacement identity', async () => {
  const isolatedBackend = createBackend();
  const error = new Error('Read failed');
  const onError = vi.fn();
  isolatedBackend.getItem.mockRejectedValue(error);
  await expect(create({ storage: isolatedBackend, onError })).rejects.toThrow(
    'Read failed'
  );
  expect(onError).toHaveBeenCalledWith(error);
  expect(isolatedBackend.setItem).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('can retry a failed final write by disposing again', async () => {
  const client = await create({ connectivity });
  backend.setItem.mockRejectedValueOnce(new Error('Write failed'));
  client.track('Save On Dispose');
  await expect(client.dispose()).rejects.toThrow('Write failed');
  await client.dispose();
  expect(backend.values.get(keys.events)).toContain('Save On Dispose');
  expect(appStateListenerCount()).toBe(0);
});

it('does not pause existing consent when an unrelated configuration write fails', async () => {
  const client = await create();
  backend.setItem.mockRejectedValueOnce(new Error('Write failed'));
  client.track('Queued');
  await expect(client.configure({ release: 'v2' })).rejects.toThrow(
    'Write failed'
  );
  await vi.advanceTimersByTimeAsync(1_000_000);
  expect(payloads()).toEqual(
    expect.arrayContaining([expect.objectContaining({ event: 'Queued' })])
  );
});

it('cleans up partially initialized native subscriptions if connectivity setup fails', async () => {
  await expect(
    create({
      connectivity: {
        addEventListener() {
          throw new Error('Native module unavailable');
        },
      },
    })
  ).rejects.toThrow('Native module unavailable');
  expect(appStateListenerCount()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
