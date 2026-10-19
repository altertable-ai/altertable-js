import { getStorageKeys } from '@altertable/altertable-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { lifecycleOwnershipConformanceTests } from '../../../test-utils/platformLifecycleConformance';
import {
  createAltertable,
  type Connectivity,
  type ReactNativeClient,
} from '../src';
import { createAsyncStorageMock, deferred } from './helpers';
import {
  AppState,
  appStateListenerCount,
  emitAppState,
} from './reactNativeMock';

const clients: ReactNativeClient[] = [];
const keys = getStorageKeys('key');
let storageMock: ReturnType<typeof createAsyncStorageMock>;
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
    storage: storageMock,
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
  storageMock = createAsyncStorageMock();
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

it('restores anonymous identity, identified identity, and unsent events across restarts', async () => {
  const first = await create({ connectivity });
  first.track('Before Login');
  await first.flushPersistence();
  const anonymous = JSON.parse(storageMock.values.get(keys.session)!);
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
  expect(storageMock.values.has(keys.events)).toBe(false);
});

it('does not expose a client before identity hydration completes', async () => {
  const read = deferred<string | null>();
  const isolatedStorageMock = createAsyncStorageMock();
  isolatedStorageMock.getItem.mockReturnValue(read.promise);
  const result = create({ storage: isolatedStorageMock });
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
  const session = JSON.parse(storageMock.values.get(keys.session)!);
  storageMock.values.set(
    keys.session,
    JSON.stringify({ ...session, trackingConsent: 'denied' })
  );

  const second = await create();
  second.track('Denied');
  await second.flush();
  expect(second.getTrackingConsent()).toBe('denied');
  expect(fetch).not.toHaveBeenCalled();
  expect(storageMock.values.has(keys.events)).toBe(false);
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
  expect(storageMock.values.has(keys.events)).toBe(false);
  await client.configure({ trackingConsent: 'granted' });
  expect(storageMock.values.get(keys.events)).toContain('Pending');
  await client.configure({ trackingConsent: 'denied' });
  expect(storageMock.values.has(keys.events)).toBe(false);
  expect(JSON.parse(storageMock.values.get(keys.session)!)).toMatchObject({
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
  expect(storageMock.values.has(keys.events)).toBe(false);
  expect(storageMock.values.has(keys.session)).toBe(true);
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
  const before = JSON.parse(storageMock.values.get(keys.session)!);
  await client.reset();
  const after = JSON.parse(storageMock.values.get(keys.session)!);
  expect(after.deviceId).toBe(before.deviceId);
  expect(after.distinctId).not.toBe(before.distinctId);
  expect(after.trackingConsent).toBe(before.trackingConsent);
  expect(storageMock.values.has(keys.events)).toBe(false);
});

it('records native screen properties and metadata', async () => {
  const client = await create();
  client.screen('Home');
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

it('persists profile updates and identity aliases through an offline restart', async () => {
  const first = await create({ connectivity });
  first.identify('user-123', { plan: 'free' });
  first.updateTraits({ plan: 'pro' });
  first.alias('customer-456');
  await first.dispose();

  const second = await create();
  second.track('After Alias');
  await second.flush();
  expect(payloads()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        distinct_id: 'user-123',
        traits: { plan: 'pro' },
      }),
      expect.objectContaining({
        distinct_id: 'user-123',
        new_user_id: 'customer-456',
      }),
      expect.objectContaining({
        event: 'After Alias',
        distinct_id: 'user-123',
      }),
    ])
  );
});

it('automatically delivers a small batch at the default interval', async () => {
  const client = await create({ flushIntervalMs: undefined });
  await vi.advanceTimersByTimeAsync(0);
  client.track('Periodic Delivery');
  await vi.advanceTimersByTimeAsync(9_999);
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(payloads()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: 'Periodic Delivery' }),
    ])
  );
});

it('does not start delivery when disposed during an awaited native flush', async () => {
  const client = await create();
  await vi.advanceTimersByTimeAsync(0);
  const write = deferred<void>();
  storageMock.setItem.mockImplementationOnce(async (key, value) => {
    await write.promise;
    storageMock.values.set(key, value);
  });
  client.track('Save Without Sending');
  const flushing = client.flush();
  const disposing = client.dispose();
  write.resolve();
  await Promise.all([flushing, disposing]);
  expect(fetch).not.toHaveBeenCalled();
  expect(storageMock.values.get(keys.events)).toContain('Save Without Sending');
});

it('does not resume delivery when disposed during a consent grant', async () => {
  const client = await create({ trackingConsent: 'pending' });
  client.track('Granted Before Disposal');
  const write = deferred<void>();
  storageMock.setItem.mockImplementationOnce(async (key, value) => {
    await write.promise;
    storageMock.values.set(key, value);
  });
  const granting = client.configure({ trackingConsent: 'granted' });
  const disposing = client.dispose();
  write.resolve();
  await Promise.all([granting, disposing]);
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.parse(storageMock.values.get(keys.session)!)).toMatchObject({
    trackingConsent: 'granted',
  });
});

it('isolates a throwing error reporter and allows replacing it during recovery', async () => {
  const initialReporter = vi.fn(() => {
    throw new Error('Reporter unavailable');
  });
  const nextReporter = vi.fn();
  const client = await create({ connectivity, onError: initialReporter });
  storageMock.setItem.mockRejectedValueOnce(new Error('Disk full'));
  client.track('First Attempt');
  await expect(client.flushPersistence()).rejects.toThrow('Disk full');
  expect(initialReporter).toHaveBeenCalled();

  await client.configure({ onError: nextReporter });
  storageMock.setItem.mockRejectedValueOnce('Storage unavailable');
  client.track('Next Attempt');
  await expect(client.flushPersistence()).rejects.toBe('Storage unavailable');
  expect(nextReporter).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Storage unavailable' })
  );
  await client.flushPersistence();
});

it('rejects a missing API key with a branded error before accessing storage', async () => {
  await expect(createAltertable('', { storage: storageMock })).rejects.toThrow(
    '[Altertable] Missing API key. Pass your API key to createAltertable().'
  );
  expect(storageMock.getItem).not.toHaveBeenCalled();
  expect(appStateListenerCount()).toBe(0);
});

it('keeps in-flight events durable when disposed and ignores late request completion', async () => {
  const response = deferred<{ ok: boolean }>();
  vi.mocked(fetch).mockReturnValue(response.promise as Promise<Response>);
  const client = await create({ flushEventThreshold: 1 });
  client.track('In Flight');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  await client.dispose();
  expect(storageMock.values.get(keys.events)).toContain('In Flight');
  const next = await create({ connectivity });
  next.track('Next Client');
  await next.flushPersistence();
  response.resolve({ ok: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(storageMock.values.get(keys.events)).toContain('Next Client');
});

it('rejects startup on storage failure and leaves no timers or listeners', async () => {
  const isolatedStorageMock = createAsyncStorageMock();
  isolatedStorageMock.setItem.mockRejectedValue(new Error('Disk full'));
  await expect(create({ storage: isolatedStorageMock })).rejects.toThrow(
    'Disk full'
  );
  expect(vi.getTimerCount()).toBe(0);
  expect(appStateListenerCount()).toBe(0);
});

it('waits for durable consent before delivering events queued under pending consent', async () => {
  const client = await create({ trackingConsent: 'pending' });
  client.track('Pending');
  const write = deferred<void>();
  storageMock.setItem.mockImplementationOnce(async (key, value) => {
    await write.promise;
    storageMock.values.set(key, value);
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
  storageMock.setItem.mockRejectedValueOnce(new Error('Disk full'));
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
  const isolatedStorageMock = createAsyncStorageMock();
  const error = new Error('Read failed');
  const onError = vi.fn();
  isolatedStorageMock.getItem.mockRejectedValue(error);
  await expect(
    create({ storage: isolatedStorageMock, onError })
  ).rejects.toThrow('Read failed');
  expect(onError).toHaveBeenCalledWith(error);
  expect(isolatedStorageMock.setItem).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('can retry a failed final write by disposing again', async () => {
  const client = await create({ connectivity });
  storageMock.setItem.mockRejectedValueOnce(new Error('Write failed'));
  client.track('Save On Dispose');
  await expect(client.dispose()).rejects.toThrow('Write failed');
  await client.dispose();
  expect(storageMock.values.get(keys.events)).toContain('Save On Dispose');
  expect(appStateListenerCount()).toBe(0);
});

it('does not pause existing consent when an unrelated configuration write fails', async () => {
  const client = await create();
  storageMock.setItem.mockRejectedValueOnce(new Error('Write failed'));
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

it('persists threshold-triggered events before starting delivery', async () => {
  const client = await create({ flushEventThreshold: 1 });
  await vi.advanceTimersByTimeAsync(0);
  const write = deferred<void>();
  const setItem = storageMock.setItem.getMockImplementation()!;
  storageMock.setItem.mockImplementation(async (key, value) => {
    if (key === keys.events) await write.promise;
    await setItem(key, value);
  });

  try {
    client.track('Durable Before Delivery');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    write.resolve();
  }
  await vi.advanceTimersByTimeAsync(0);
  expect(payloads()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: 'Durable Before Delivery' }),
    ])
  );
});

it('does not send an automatic batch after native persistence fails and retries on a later interval', async () => {
  const onError = vi.fn();
  const client = await create({ flushEventThreshold: 1, onError });
  await vi.advanceTimersByTimeAsync(0);
  const setItem = storageMock.setItem.getMockImplementation()!;
  storageMock.setItem.mockImplementation(async (key, value) => {
    if (key === keys.events) throw new Error('Event write failed');
    await setItem(key, value);
  });
  try {
    client.track('Retry After Persistence');
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    storageMock.setItem.mockImplementation(setItem);
  }
  await vi.advanceTimersByTimeAsync(1_000_000);
  expect(payloads()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: 'Retry After Persistence' }),
    ])
  );
});

it('keeps events below the threshold batched after native writes complete', async () => {
  const client = await create({ flushEventThreshold: 3 });
  await vi.advanceTimersByTimeAsync(0);
  client.track('First');
  client.track('Second');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();
  client.track('Third');
  await vi.advanceTimersByTimeAsync(0);
  expect(payloads().map(payload => payload.event)).toEqual([
    'First',
    'Second',
    'Third',
  ]);
});

it('recovers persisted offline events after backgrounding and a restart without a final flush', async () => {
  const first = await create({ connectivity });
  first.identify('reference-user');
  first.track('Offline Purchase', { order_id: 'order-1' });
  emitAppState('background');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();

  // Snapshot durable storage before disposal: a killed process cannot run cleanup.
  const recoveredStorageMock = createAsyncStorageMock();
  for (const [key, value] of storageMock.values)
    recoveredStorageMock.values.set(key, value);
  await first.dispose();

  const second = await create({ storage: recoveredStorageMock, connectivity });
  emitAppState('active');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();
  connectivityListener({ isConnected: true, isInternetReachable: true });
  await vi.advanceTimersByTimeAsync(0);
  const recovered = payloads().filter(
    payload => payload.event === 'Offline Purchase'
  );
  expect(recovered).toHaveLength(1);
  expect(recovered[0]).toMatchObject({
    distinct_id: 'reference-user',
    properties: { order_id: 'order-1' },
  });
  expect(recoveredStorageMock.values.has(keys.events)).toBe(false);
  await second.flushPersistence();
});

it('clears the previous account backlog on an offline account switch and restores the new owner', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const first = await create({ connectivity });
    first.identify('account-a');
    first.track('Account A Event');
    await first.flushPersistence();
    const accountA = JSON.parse(storageMock.values.get(keys.session)!);

    first.identify('account-b');
    first.track('Account B Event');
    await first.flushPersistence();
    const accountB = JSON.parse(storageMock.values.get(keys.session)!);
    expect(accountB.distinctId).toBe('account-b');
    expect(accountB.anonymousId).not.toBe(accountA.anonymousId);
    expect(accountB.deviceId).toBe(accountA.deviceId);
    expect(storageMock.values.get(keys.events)).not.toContain('account-a');
    await first.dispose();

    const second = await create();
    second.track('Account B After Restart');
    await second.flush();
    expect(
      payloads().every(payload => payload.distinct_id === 'account-b')
    ).toBe(true);
    expect(
      payloads()
        .filter(payload => payload.event)
        .map(payload => payload.event)
    ).toEqual(['Account B Event', 'Account B After Restart']);
  } finally {
    warn.mockRestore();
  }
});

it('keeps an offline consent revocation effective after restart and never replays cleared events', async () => {
  const first = await create({ connectivity });
  first.track('Before Revocation');
  await first.flushPersistence();
  expect(storageMock.values.get(keys.events)).toContain('Before Revocation');
  await first.configure({ trackingConsent: 'denied' });
  first.track('While Denied');
  await first.flushPersistence();
  await first.dispose();

  const second = await create();
  expect(second.getTrackingConsent()).toBe('denied');
  emitAppState('active');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();
  await second.configure({ trackingConsent: 'granted' });
  second.track('After New Grant');
  await second.flush();
  expect(
    payloads()
      .filter(payload => payload.event)
      .map(payload => payload.event)
  ).toEqual(['After New Grant']);
});

it.each(['network', 'server'])(
  'bounds automatic %s outage retries and resumes on the next interval',
  async failure => {
    const client = await create({ flushEventThreshold: 1 });
    await vi.advanceTimersByTimeAsync(0);
    if (failure === 'network') {
      vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
    } else {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({}),
      } as Response);
    }

    client.track('Retry Later');
    // Repeated lifecycle requests during delivery must share the same attempt.
    emitAppState('background');
    emitAppState('active');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(storageMock.values.get(keys.events)).toContain('Retry Later');

    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    await vi.advanceTimersByTimeAsync(940_000);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(storageMock.values.has(keys.events)).toBe(false);
  }
);

it('closes storage and stops timers when connectivity cleanup throws', async () => {
  const onError = vi.fn();
  const cleanupError = new Error('Connectivity cleanup failed');
  const client = await create({
    onError,
    connectivity: {
      addEventListener() {
        return () => {
          throw cleanupError;
        };
      },
    },
  });
  await vi.advanceTimersByTimeAsync(0);
  const request = deferred<Response>();
  vi.mocked(fetch).mockReturnValue(request.promise);
  client.track('In Flight');
  const flushing = client.flush();
  await vi.advanceTimersByTimeAsync(0);

  await expect(client.dispose()).resolves.toBeUndefined();
  expect(onError).toHaveBeenCalledWith(cleanupError);
  expect(appStateListenerCount()).toBe(0);
  // The only remaining timer belongs to the HTTP request, not the batcher.
  request.resolve({ ok: true } as Response);
  await flushing;
  expect(vi.getTimerCount()).toBe(0);
  expect(storageMock.values.get(keys.events)).toContain('In Flight');
  await client.dispose();
  expect(onError).toHaveBeenCalledTimes(1);
});

it('continues disposal when app state cleanup throws', async () => {
  const error = new Error('App state cleanup failed');
  const subscribe = AppState.addEventListener.getMockImplementation()!;
  AppState.addEventListener.mockImplementationOnce((event, listener) => {
    const subscription = subscribe(event, listener);
    return {
      remove() {
        subscription.remove();
        throw error;
      },
    };
  });
  const onError = vi.fn();
  const client = await create({ connectivity, onError });
  client.track('Persist On Disposal');
  await client.dispose();
  expect(onError).toHaveBeenCalledWith(error);
  expect(unsubscribeConnectivity).toHaveBeenCalledOnce();
  expect(appStateListenerCount()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(storageMock.values.get(keys.events)).toContain('Persist On Disposal');
});

it('still drains retryable failures when explicitly flushed', async () => {
  const client = await create();
  await vi.advanceTimersByTimeAsync(0);
  client.track('Explicit Recovery');
  vi.mocked(fetch)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockRejectedValueOnce(new Error('Offline'))
    .mockRejectedValueOnce(new Error('Offline'))
    .mockRejectedValueOnce(new Error('Offline'));
  const flushing = client.flush();
  await vi.advanceTimersByTimeAsync(60_000);
  await flushing;
  expect(fetch).toHaveBeenCalledTimes(5);
  expect(storageMock.values.has(keys.events)).toBe(false);
});

it('delivers new threshold events collected during an automatic request', async () => {
  const client = await create({ flushEventThreshold: 1 });
  await vi.advanceTimersByTimeAsync(0);
  const request = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(request.promise);
  client.track('First');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();

  client.track('Second');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  request.resolve({ ok: true } as Response);
  await vi.advanceTimersByTimeAsync(0);
  expect(payloads().map(payload => payload.event)).toEqual(['First', 'Second']);
  expect(storageMock.values.has(keys.events)).toBe(false);
});

it('explains how to supply storage before starting the client', async () => {
  // JavaScript callers can omit required configuration despite the TypeScript contract.
  // @ts-expect-error Validate runtime behavior when storage is missing.
  await expect(createAltertable('key', {})).rejects.toThrow(
    '[Altertable] Missing storage. Pass an async storage backend, such as AsyncStorage, to createAltertable().'
  );
  expect(appStateListenerCount()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('explains how to recover from using a disposed client', async () => {
  const client = await create();
  await client.dispose();
  const message =
    '[Altertable] This client has been disposed. Create a new client with createAltertable() to continue.';
  expect(() => client.track('Late Callback')).toThrow(message);
  expect(() => client.identify('user')).toThrow(message);
  await expect(
    client.configure({ trackingConsent: 'granted' })
  ).rejects.toThrow(message);
  await expect(client.flush()).rejects.toThrow(message);
  expect(() => client.flushPersistence()).toThrow(message);
  expect(fetch).not.toHaveBeenCalled();
});

it('warns once about repeated native persistence failures without an error callback', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const client = await create();
  await vi.advanceTimersByTimeAsync(0);
  const error = new Error('Storage unavailable');
  storageMock.setItem.mockRejectedValue(error);
  try {
    client.track('Not Yet Durable');
    await expect(client.flushPersistence()).rejects.toBe(error);
    await expect(client.flushPersistence()).rejects.toBe(error);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[Altertable React Native] Failed to persist analytics. Recent changes are not durable; call flushPersistence() to retry.',
      error
    );
  } finally {
    storageMock.setItem.mockImplementation(async (key, value) => {
      storageMock.values.set(key, value);
    });
    await client.flushPersistence();
    warn.mockRestore();
  }
});

it('coalesces restored startup delivery with newly collected threshold events', async () => {
  const first = await create({ connectivity });
  first.track('Restored Event');
  await first.dispose();
  const response = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(response.promise);
  const second = await create({ flushEventThreshold: 1 });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  second.track('New Event');
  emitAppState('active');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  response.resolve({ ok: true } as Response);
  await vi.advanceTimersByTimeAsync(0);
  expect(payloads().map(payload => payload.event)).toEqual([
    'Restored Event',
    'New Event',
  ]);
});

it('reports a native write failure once when automatic preparation observes it', async () => {
  const errors: Error[] = [];
  const client = await create({
    flushEventThreshold: 1,
    onError: error => errors.push(error),
  });
  await vi.advanceTimersByTimeAsync(0);
  const error = new Error('Write failed');
  const setItem = storageMock.setItem.getMockImplementation()!;
  storageMock.setItem.mockImplementation(async (key, value) => {
    if (key === keys.events) throw error;
    await setItem(key, value);
  });
  try {
    client.track('Not Yet Durable');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(errors).toEqual([error]);
  } finally {
    storageMock.setItem.mockImplementation(setItem);
  }
});

it('does not immediately retry a failed automatic snapshot after startup', async () => {
  const onError = vi.fn();
  const client = await create({ flushEventThreshold: 1, onError });
  // Track before startup's automatic preparation has completed.
  vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
  client.track('Joined Startup Snapshot');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(onError).toHaveBeenCalledOnce();
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
});

it('prepares a fixed snapshot when another event arrives after native persistence completes', async () => {
  const client = await create({ flushEventThreshold: 1 });
  await vi.advanceTimersByTimeAsync(0);
  const secondWrite = deferred<void>();
  const setItem = storageMock.setItem.getMockImplementation()!;
  storageMock.setItem.mockImplementation(async (key, value) => {
    if (key === keys.events && value.includes('Second'))
      await secondWrite.promise;
    await setItem(key, value);
  });
  try {
    client.track('First');
    const arrival = client
      .flushPersistence()
      .then(() => client.track('Second'));
    await vi.advanceTimersByTimeAsync(0);
    await arrival;
    expect(payloads().map(payload => payload.event)).toEqual(['First']);
    expect(storageMock.values.get(keys.events)).not.toContain('Second');
  } finally {
    secondWrite.resolve();
  }
  await vi.advanceTimersByTimeAsync(0);
  expect(payloads().map(payload => payload.event)).toEqual(['First', 'Second']);
});

// Native replacement creates a new core, so this verifies disposal isolation.
// The core platform suite also exercises replacement on the same instance.
lifecycleOwnershipConformanceTests(async () => {
  const addEventListener = AppState.addEventListener.getMockImplementation()!;
  const listeners: Array<Parameters<typeof AppState.addEventListener>[1]> = [];
  const removals: Array<() => void> = [];
  let staleListeners: typeof listeners = [];
  let cleanupError: Error | undefined;
  AppState.addEventListener.mockImplementation((event, listener) => {
    listeners.push(listener);
    const subscription = addEventListener(event, listener);
    removals.push(subscription.remove);
    return {
      remove() {
        if (cleanupError) throw cleanupError;
        subscription.remove();
      },
    };
  });
  const first = await create();
  return {
    retire: () => first.dispose(),
    replace: () => create(),
    setCleanupError(error) {
      staleListeners = [...listeners];
      cleanupError = error;
    },
    emitStale: () => staleListeners.forEach(listener => listener('active')),
    cleanup() {
      cleanupError = undefined;
      removals.forEach(remove => remove());
      AppState.addEventListener.mockImplementation(addEventListener);
    },
  };
});

it.each(['denial', 'reset', 'disposal'] as const)(
  'cancels native HTTP retry backoff on %s',
  async action => {
    const onError = vi.fn();
    const client = await create({ flushEventThreshold: 1, onError });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      json: async () => ({}),
    } as Response);
    client.track('Withdrawn');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledOnce();
    if (action === 'denial')
      await client.configure({ trackingConsent: 'denied' });
    else if (action === 'reset') await client.reset();
    else await client.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    if (action === 'disposal') {
      expect(storageMock.values.get(keys.events)).toContain('Withdrawn');
    } else {
      expect(storageMock.values.has(keys.events)).toBe(false);
    }
  }
);
