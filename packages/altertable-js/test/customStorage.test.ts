// @vitest-environment node

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { Altertable, getStorageKeys, type StorageAdapter } from '../src';

let cleanup: (() => void) | undefined;

function createStorage() {
  const values = new Map<string, string>();
  const storage: StorageAdapter = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      values.set(key, value);
      return true;
    },
    removeItem: key => {
      values.delete(key);
    },
  };
  return { storage, values };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  cleanup?.();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('stores identity and events under public API-key-scoped keys', async () => {
  const { storage, values } = createStorage();
  const keys = getStorageKeys('key', 'staging');
  const client = new Altertable();
  cleanup = client.init('key', {
    persistence: storage,
  });
  client.track('Purchase');
  expect(values.has(keys.session)).toBe(true);
  expect(values.get(keys.events)).toContain('Purchase');
  await client.flush();
  expect(values.has(keys.events)).toBe(false);
});

it('uses the migrated identity store for future identity mutations', () => {
  const first = createStorage();
  const second = createStorage();
  const client = new Altertable();
  cleanup = client.init('key', { persistence: first.storage });
  client.configure({ persistence: second.storage });
  client.identify('user-123');
  const key = getStorageKeys('key').session;
  expect(first.values.has(key)).toBe(false);
  expect(JSON.parse(second.values.get(key)!)).toMatchObject({
    distinctId: 'user-123',
  });
});

it('uses custom connectivity detection for delivery and retries when online', async () => {
  let online = false;
  const client = new Altertable({
    getContext: () => ({}),
    isOnline: () => online,
  });
  cleanup = client.init('key', { persistence: 'memory' });
  client.track('Offline');
  await client.flush();
  expect(fetch).not.toHaveBeenCalled();
  online = true;
  await client.flush();
  expect(fetch).toHaveBeenCalledOnce();
});

it.each([true, false])(
  'retains replacement events after an old request completes (ok=%s)',
  async ok => {
    const response = Promise.withResolvers<Response>();
    vi.mocked(fetch).mockReturnValueOnce(response.promise);
    const { storage, values } = createStorage();
    const client = new Altertable({ getContext: () => ({}) });
    cleanup = client.init('key', { persistence: storage });
    client.track('Old Event');
    const sending = client.flush({ drain: false });
    expect(fetch).toHaveBeenCalledOnce();
    cleanup = client.init('key', { persistence: storage });
    client.track('Replacement Event');
    const key = getStorageKeys('key').events;
    expect(values.get(key)).toContain('Replacement Event');
    response.resolve({
      ok,
      status: ok ? 200 : 400,
      statusText: 'Bad Request',
      json: async () => ({}),
    } as Response);
    await sending;
    expect(values.get(key)).toContain('Replacement Event');
    cleanup();
    const restored = new Altertable({ getContext: () => ({}) });
    cleanup = restored.init('key', { persistence: storage });
    await restored.flush();
    const events = vi
      .mocked(fetch)
      .mock.calls.flatMap(([, options]) => JSON.parse(options!.body as string));
    expect(events.map(event => event.event)).toEqual([
      'Old Event',
      'Replacement Event',
    ]);
  }
);

it('cancels retries from a retired batcher without changing the replacement buffer', async () => {
  const response = Promise.withResolvers<Response>();
  vi.mocked(fetch).mockReturnValueOnce(response.promise);
  const { storage, values } = createStorage();
  const client = new Altertable({ getContext: () => ({}) });
  const config = { persistence: storage, flushIntervalMs: 1_000_000 };
  cleanup = client.init('key', config);
  client.track('Retired Event');
  const sending = client.flush({ drain: false });
  cleanup = client.init('key', config);
  client.track('Replacement Event');
  const unavailable = {
    ok: false,
    status: 503,
    statusText: 'Unavailable',
    json: async () => ({}),
  } as Response;
  vi.mocked(fetch).mockResolvedValue(unavailable);
  response.resolve(unavailable);
  await vi.advanceTimersByTimeAsync(60_000);
  await sending;
  expect(fetch).toHaveBeenCalledOnce();
  expect(values.get(getStorageKeys('key').events)).toContain(
    'Replacement Event'
  );
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
  await client.flush();
  expect(values.has(getStorageKeys('key').events)).toBe(false);
});

it.each(['denial', 'reset', 'cleanup'] as const)(
  'cancels retries after %s, both during a request and its backoff',
  async action => {
    for (const phase of ['request', 'backoff']) {
      const response = Promise.withResolvers<Response>();
      const unavailable = {
        ok: false,
        status: 503,
        statusText: 'Unavailable',
        json: async () => ({}),
      } as Response;
      vi.mocked(fetch).mockClear().mockReturnValueOnce(response.promise);
      const onError = vi.fn();
      const client = new Altertable({ getContext: () => ({}) });
      const config = {
        persistence: 'memory' as const,
        flushIntervalMs: 1_000_000,
        onError,
      };
      cleanup = client.init('key', config);
      client.track('Withdrawn');
      const sending = client.flush({ drain: false });
      let settled = false;
      void sending.then(() => {
        settled = true;
        return;
      });
      const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
      if (phase === 'backoff') {
        response.resolve(unavailable);
        await vi.advanceTimersByTimeAsync(0);
      }
      if (action === 'denial') client.configure({ trackingConsent: 'denied' });
      else if (action === 'reset') client.reset();
      else cleanup();
      response.resolve(unavailable);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      await sending;
      expect(fetch).toHaveBeenCalledOnce();
      if (phase === 'request') expect(signal.aborted).toBe(true);
      expect(onError).not.toHaveBeenCalled();
      if (action === 'denial') client.configure({ trackingConsent: 'granted' });
      else if (action === 'cleanup') cleanup = client.init('key', config);
      client.track('Current');
      await client.flush();
      expect(
        vi
          .mocked(fetch)
          .mock.calls.map(([, options]) =>
            JSON.parse(options!.body as string).map(
              (event: { event: string }) => event.event
            )
          )
      ).toEqual([['Withdrawn'], ['Current']]);
      cleanup();
    }
  }
);

it.each([true, false])(
  'keeps persistence disabled through writes and late completion (ok=%s), then restores it when enabled',
  async ok => {
    const response = Promise.withResolvers<Response>();
    vi.mocked(fetch).mockReturnValueOnce(response.promise);
    const { storage, values } = createStorage();
    const key = getStorageKeys('key').events;
    const client = new Altertable({ getContext: () => ({}) });
    cleanup = client.init('key', {
      persistence: storage,
      flushIntervalMs: 1_000_000,
    });
    client.track('In Flight');
    const sending = client.flush({ drain: false });
    client.configure({ eventPersistence: false });
    expect(values.has(key)).toBe(false);
    client.track('Memory Only');
    expect(values.has(key)).toBe(false);
    response.resolve({
      ok,
      status: ok ? 200 : 503,
      statusText: 'Unavailable',
      json: async () => ({}),
    } as Response);
    if (!ok) {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Unavailable',
        json: async () => ({}),
      } as Response);
    }
    await vi.advanceTimersByTimeAsync(60_000);
    await sending;
    expect(values.has(key)).toBe(false);
    client.configure({ flushIntervalMs: 2_000_000 });
    client.track('Still In Memory');
    expect(values.has(key)).toBe(false);
    client.configure({ eventPersistence: storage });
    expect(values.get(key)).toContain('Memory Only');
    expect(values.get(key)).toContain('Still In Memory');
    if (!ok) expect(values.get(key)).toContain('In Flight');
    client.configure({ flushIntervalMs: 3_000_000 });
    client.track('Durable Again');
    expect(values.get(key)).toContain('Durable Again');
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    await client.flush();
    expect(values.has(key)).toBe(false);
  }
);

it.each(['denial', 'reset'] as const)(
  'completes %s and cancels delivery when event deletion throws',
  async action => {
    const response = Promise.withResolvers<Response>();
    vi.mocked(fetch).mockReturnValueOnce(response.promise);
    const { storage, values } = createStorage();
    const failure = new Error('Deletion failed');
    const key = getStorageKeys('key').events;
    const removeItem = storage.removeItem;
    storage.removeItem = item => {
      if (item === key) throw failure;
      removeItem(item);
    };
    const onError = vi.fn();
    const client = new Altertable({ getContext: () => ({}) });
    cleanup = client.init('key', {
      persistence: storage,
      onError,
      flushIntervalMs: 1_000_000,
    });
    client.track('Withdrawn');
    const identity = JSON.parse(
      values.get(getStorageKeys('key').session)!
    ).distinctId;
    const sending = client.flush({ drain: false });
    expect(() => {
      if (action === 'denial') client.configure({ trackingConsent: 'denied' });
      else client.reset();
    }).not.toThrow();
    if (action === 'denial') expect(client.getTrackingConsent()).toBe('denied');
    else
      expect(
        JSON.parse(values.get(getStorageKeys('key').session)!).distinctId
      ).not.toBe(identity);
    expect(onError).toHaveBeenCalledWith(failure);
    response.resolve({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      json: async () => ({}),
    } as Response);
    await vi.advanceTimersByTimeAsync(60_000);
    await sending;
    expect(fetch).toHaveBeenCalledOnce();
    // Storage could not erase the old bytes; report that failure without keeping them live.
    expect(values.get(key)).toContain('Withdrawn');
    storage.removeItem = removeItem;
    if (action === 'denial') client.configure({ trackingConsent: 'granted' });
    client.track('Current');
    await client.flush();
    expect(values.has(key)).toBe(false);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.flatMap(([, options]) =>
          JSON.parse(options!.body as string)
        )
        .map(event => event.event)
    ).toEqual(['Withdrawn', 'Current']);
  }
);

it('detaches persistence despite deletion failure and can enable and disable it again', async () => {
  const { storage, values } = createStorage();
  const failure = new Error('Deletion failed');
  const key = getStorageKeys('key').events;
  const removeItem = storage.removeItem;
  const onError = vi.fn();
  const client = new Altertable({ getContext: () => ({}) });
  cleanup = client.init('key', { persistence: storage, onError });
  client.track('Before Disable');
  const previousValue = values.get(key);
  storage.removeItem = item => {
    if (item === key) throw failure;
    removeItem(item);
  };
  expect(() => client.configure({ eventPersistence: false })).not.toThrow();
  expect(onError).toHaveBeenCalledWith(failure);
  client.track('Memory Only');
  expect(values.get(key)).toBe(previousValue);
  await client.flush();
  expect(values.get(key)).toBe(previousValue);
  storage.removeItem = removeItem;
  client.configure({ eventPersistence: storage });
  client.track('Durable Again');
  expect(values.get(key)).toContain('Durable Again');
  expect(values.get(key)).not.toContain('Before Disable');
  client.configure({ eventPersistence: false });
  expect(values.has(key)).toBe(false);
  client.track('Memory Again');
  expect(values.has(key)).toBe(false);
});

it('keeps acknowledged events removed when persisting the remaining buffer throws', async () => {
  const response = Promise.withResolvers<Response>();
  vi.mocked(fetch).mockReturnValueOnce(response.promise);
  const { storage, values } = createStorage();
  const failure = new Error('Write failed');
  const onError = vi.fn();
  const client = new Altertable({ getContext: () => ({}) });
  cleanup = client.init('key', {
    persistence: storage,
    onError,
    flushIntervalMs: 1_000_000,
  });
  client.track('Acknowledged');
  const sending = client.flush({ drain: false });
  client.track('Later');
  const setItem = storage.setItem;
  storage.setItem = () => {
    throw failure;
  };
  response.resolve({ ok: true } as Response);
  await expect(sending).resolves.toBeUndefined();
  expect(onError).toHaveBeenCalledWith(failure);
  storage.setItem = setItem;
  await client.flush();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.map(([, options]) =>
        JSON.parse(options!.body as string).map(
          (event: { event: string }) => event.event
        )
      )
  ).toEqual([['Acknowledged'], ['Later']]);
  expect(values.has(getStorageKeys('key').events)).toBe(false);
});

it('keeps events available for delivery when custom event storage writes throw', async () => {
  const { storage } = createStorage();
  const failure = new Error('Write failed');
  const onError = vi.fn();
  const client = new Altertable({ getContext: () => ({}) });
  cleanup = client.init('key', {
    persistence: 'memory',
    eventPersistence: storage,
    onError,
  });
  storage.setItem = () => {
    throw failure;
  };
  expect(() => client.track('Memory Fallback')).not.toThrow();
  expect(onError).toHaveBeenCalledWith(failure);
  await client.flush();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.flatMap(([, options]) => JSON.parse(options!.body as string))
      .map(event => event.event)
  ).toEqual(['Memory Fallback']);
});

it('retains undelivered events when HTTP failure and a storage write failure coincide', async () => {
  const { storage, values } = createStorage();
  const failure = new Error('Write failed');
  const onError = vi.fn();
  const client = new Altertable({ getContext: () => ({}) });
  cleanup = client.init('key', {
    persistence: storage,
    onError,
    flushIntervalMs: 1_000_000,
  });
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
    status: 503,
    statusText: 'Unavailable',
    json: async () => ({}),
  } as Response);
  client.track('Undelivered');
  const sending = client.flush({ drain: false });
  client.track('Later');
  const setItem = storage.setItem;
  storage.setItem = () => {
    throw failure;
  };
  await vi.advanceTimersByTimeAsync(60_000);
  await expect(sending).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ status: 503 })
  );
  expect(onError).toHaveBeenCalledWith(failure);
  storage.setItem = setItem;
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
  await client.flush();
  expect(
    JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string).map(
      (event: { event: string }) => event.event
    )
  ).toEqual(['Undelivered', 'Later']);
  expect(values.has(getStorageKeys('key').events)).toBe(false);
});

it.each(['session', 'events'] as const)(
  'preserves identified identity after retrying a failed %s migration and restarting immediately',
  async failedKey => {
    const source = createStorage();
    const target = createStorage();
    const keys = getStorageKeys('key');
    const client = new Altertable({ getContext: () => ({}) });
    cleanup = client.init('key', { persistence: source.storage });
    client.identify('user-123');
    client.track('Before Migration');
    const savedIdentity = JSON.parse(source.values.get(keys.session)!);
    const getItem = source.storage.getItem;
    const failure = new Error('Temporary storage read failure');
    source.storage.getItem = key => {
      if (key === keys[failedKey]) throw failure;
      return getItem(key);
    };
    expect(() => client.configure({ persistence: target.storage })).toThrow(
      failure
    );
    source.storage.getItem = getItem;
    client.configure({ persistence: target.storage });
    // Restart before another identity write could hide a failed migration.
    cleanup();
    const restored = new Altertable({ getContext: () => ({}) });
    cleanup = restored.init('key', { persistence: target.storage });
    expect(JSON.parse(target.values.get(keys.session)!)).toMatchObject(
      savedIdentity
    );
    restored.track('After Restart');
    await restored.flush();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.flatMap(([, options]) =>
          JSON.parse(options!.body as string)
        )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'Before Migration',
          distinct_id: 'user-123',
        }),
        expect.objectContaining({
          event: 'After Restart',
          distinct_id: 'user-123',
          device_id: savedIdentity.deviceId,
        }),
      ])
    );
    expect(source.values.has(keys.session)).toBe(false);
    expect(source.values.has(keys.events)).toBe(false);
  }
);

it.each(['production', 'staging', 'events'])(
  'migrates legacy %s identity, consent, and queued events before initialization',
  async environment => {
    const { storage, values } = createStorage();
    const keys = getStorageKeys('key');
    const legacySession = `atbl.key.${environment}`;
    const legacyEvents = `${legacySession}.events`;
    const identity = {
      deviceId: 'device-saved',
      distinctId: 'saved-user',
      anonymousId: 'anonymous-saved',
      sessionId: 'session-saved',
      lastEventAt: new Date().toISOString(),
      trackingConsent: 'pending',
    };
    values.set(legacySession, JSON.stringify(identity));
    values.set(
      legacyEvents,
      JSON.stringify({
        version: 1,
        expiresAt: Date.now() + 60_000,
        buffers: {
          track: [
            {
              environment,
              event: 'Saved',
              distinct_id: 'saved-user',
              anonymous_id: null,
              timestamp: new Date().toISOString(),
              properties: {},
            },
          ],
        },
        order: [{ eventType: 'track', index: 0 }],
      })
    );
    const client = new Altertable({ getContext: () => ({}) });
    cleanup = client.init('key', { environment, persistence: storage });
    expect(JSON.parse(values.get(keys.session)!)).toMatchObject(identity);
    expect(values.has(legacySession)).toBe(false);
    expect(values.has(legacyEvents)).toBe(false);
    expect(client.getTrackingConsent()).toBe('pending');
    await client.flush();
    expect(fetch).not.toHaveBeenCalled();
    client.configure({ trackingConsent: 'granted' });
    client.track('Current');
    await client.flush();
    const payloads = vi
      .mocked(fetch)
      .mock.calls.flatMap(([, options]) => JSON.parse(options!.body as string));
    expect(payloads.map(payload => payload.event)).toEqual([
      'Saved',
      'Current',
    ]);
    for (const payload of payloads)
      expect(payload).not.toHaveProperty('environment');
  }
);

it('keeps canonical identity and does not replay superseded legacy events after restart', async () => {
  const { storage, values } = createStorage();
  let client = new Altertable({ getContext: () => ({}) });
  cleanup = client.init('key', { persistence: storage });
  client.identify('current-user');
  client.track('Current');
  cleanup();
  const keys = getStorageKeys('key');
  values.set('atbl.key.production', JSON.stringify({ distinctId: 'old-user' }));
  values.set(
    'atbl.key.production.events',
    values.get(keys.events)!.replace('Current', 'Superseded')
  );
  client = new Altertable({ getContext: () => ({}) });
  cleanup = client.init('key', { persistence: storage });
  expect(JSON.parse(values.get(keys.session)!)).toMatchObject({
    distinctId: 'current-user',
  });
  await client.flush();
  cleanup();
  client = new Altertable({ getContext: () => ({}) });
  cleanup = client.init('key', { persistence: storage });
  await client.flush();
  const events = vi
    .mocked(fetch)
    .mock.calls.flatMap(([, options]) => JSON.parse(options!.body as string));
  expect(
    events.filter(event => 'event' in event).map(event => event.event)
  ).toEqual(['Current']);
});

it.each(['session', 'events'] as const)(
  'retains legacy %s data when the destination write fails and retries on restart',
  async failedKey => {
    const { storage, values } = createStorage();
    const keys = getStorageKeys('key');
    let client = new Altertable({ getContext: () => ({}) });
    cleanup = client.init('key', { persistence: storage });
    client.identify('saved-user');
    client.track('Saved');
    cleanup();
    const legacyKeys = {
      session: 'atbl.key.staging',
      events: 'atbl.key.staging.events',
    };
    for (const name of ['session', 'events'] as const) {
      values.set(legacyKeys[name], values.get(keys[name])!);
      values.delete(keys[name]);
    }
    const setItem = storage.setItem;
    storage.setItem = (key, value) =>
      key === keys[failedKey] ? false : setItem(key, value);
    client = new Altertable({ getContext: () => ({}) });
    cleanup = client.init('key', {
      persistence: storage,
      environment: 'staging',
    });
    expect(values.has(legacyKeys[failedKey])).toBe(true);
    expect(client.getTrackingConsent()).toBe('granted');
    cleanup();
    storage.setItem = setItem;
    client = new Altertable({ getContext: () => ({}) });
    cleanup = client.init('key', {
      persistence: storage,
      environment: 'staging',
    });
    expect(JSON.parse(values.get(keys.session)!)).toMatchObject({
      distinctId: 'saved-user',
    });
    await client.flush();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.flatMap(([, options]) =>
          JSON.parse(options!.body as string)
        )
        .filter(event => 'event' in event)
        .map(event => event.event)
    ).toEqual(['Saved']);
    expect(values.has(legacyKeys[failedKey])).toBe(false);
  }
);

it('stops initialization when legacy deletion fails so stale queued events cannot replay', async () => {
  const { storage, values } = createStorage();
  const client = new Altertable({ getContext: () => ({}) });
  const keys = getStorageKeys('key');
  values.set(
    'atbl.key.production',
    JSON.stringify({ distinctId: 'saved-user', trackingConsent: 'denied' })
  );
  const removeItem = storage.removeItem;
  storage.removeItem = () => {
    throw new Error('Cannot remove legacy data');
  };
  expect(() => client.init('key', { persistence: storage })).toThrow(
    'Failed to remove legacy analytics storage'
  );
  expect(values.has('atbl.key.production')).toBe(true);
  expect(values.has(keys.session)).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  storage.removeItem = removeItem;
  cleanup = client.init('key', { persistence: storage });
  expect(client.getTrackingConsent()).toBe('denied');
  expect(values.has('atbl.key.production')).toBe(false);
});
