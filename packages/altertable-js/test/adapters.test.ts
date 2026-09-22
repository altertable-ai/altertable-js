import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupBeaconAvailable } from '../../../test-utils/networkMode';
import { normalizePostHogEvent } from '../src/adapters/posthog';
import { PREFIX_ANONYMOUS_ID } from '../src/constants';
import { Altertable, type AltertableConfig } from '../src/core';

const IGNORED_ALTERTABLE_CALL_WARNING =
  '[Altertable] Altertable track, page, identify, alias, updateTraits, and reset calls were ignored because an analytics adapter is configured.';

function event(overrides: Record<string, unknown> = {}) {
  return {
    event: 'Checkout',
    uuid: 'source-event-id',
    timestamp: new Date('2026-09-21T10:00:00.000Z'),
    properties: {
      distinct_id: 'customer',
      $device_id: 'device-uuid',
      $session_id: 'session-uuid',
      token: 'posthog-key',
      $lib: 'web',
      $lib_version: 'source-version',
      $current_url: 'https://example.com/cart',
      $referrer: 'https://example.com',
      utm_source: 'newsletter',
      cart: { total: 42 },
    },
    ...overrides,
  };
}

function createAdapter() {
  const listeners = new Set<(event: unknown) => void>();
  const unsubscribe = vi.fn();
  const on = vi.fn(
    (_name: 'eventCaptured', callback: (event: unknown) => void) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
        unsubscribe();
      };
    }
  );
  return {
    on,
    unsubscribe,
    emit: (value: unknown) => listeners.forEach(listener => listener(value)),
  };
}

function requests(path = '/track') {
  return vi
    .mocked(global.fetch)
    .mock.calls.filter(([url]) => String(url).includes(path))
    .flatMap(([, init]) => JSON.parse(init!.body as string));
}

describe('PostHog normalization', () => {
  it('preserves source context and copies properties without overwriting explicit mappings', () => {
    const input = event();
    const [record] = normalizePostHogEvent(input, 'staging');
    expect(record).toEqual({
      type: 'track',
      source: {
        provider: 'posthog',
        event_id: 'source-event-id',
        lib: 'TEST_LIB_NAME',
        lib_version: 'TEST_LIB_VERSION',
      },
      payload: {
        environment: 'staging',
        distinct_id: 'customer',
        device_id: 'device-uuid',
        anonymous_id: null,
        session_id: 'session-uuid',
        timestamp: '2026-09-21T10:00:00.000Z',
        event: 'Checkout',
        properties: {
          ...input.properties,
          token: undefined,
          $url: 'https://example.com/cart',
          $referer: 'https://example.com',
          $utm_source: 'newsletter',
        },
      },
    });
    expect(record.payload).not.toHaveProperty('properties.$altertable_source');
    input.properties.cart.total = 100;
    expect(record.payload).toMatchObject({
      properties: { cart: { total: 42 } },
    });
    expect(input.properties.token).toBe('posthog-key');
    expect(input.properties).not.toHaveProperty('$url');
    const [mapped] = normalizePostHogEvent(
      event({ properties: { ...input.properties, $url: 'redacted' } }),
      'production'
    );
    expect(mapped.payload).toMatchObject({ properties: { $url: 'redacted' } });
  });

  it('accepts ISO timestamps and missing optional source context without generating it', () => {
    const [record] = normalizePostHogEvent(
      event({
        properties: { distinct_id: 'uuid' },
        timestamp: '2026-09-21T10:00:00Z',
        uuid: undefined,
      }),
      'production'
    );
    expect(record.payload).toMatchObject({
      distinct_id: 'uuid',
      anonymous_id: null,
      timestamp: '2026-09-21T10:00:00.000Z',
    });
    expect(record.payload.device_id).toBeUndefined();
    expect(record.payload).toMatchObject({ session_id: undefined });
  });

  it('maps identify and overwrite traits while retaining set-once data as source properties', () => {
    const records = normalizePostHogEvent(
      event({
        event: '$identify',
        properties: {
          distinct_id: 'user',
          $anon_distinct_id: 'anonymous',
          $set: { tier: 'old', retained: true },
        },
        $set: { tier: 'pro' },
        $set_once: { first: 'original' },
      }),
      'production'
    );
    expect(records[0].payload).toMatchObject({
      properties: {
        $set: { tier: 'pro', retained: true },
        $set_once: { first: 'original' },
      },
    });
    expect(records[1]).toMatchObject({
      type: 'identify',
      payload: {
        distinct_id: 'user',
        anonymous_id: 'anonymous',
        traits: { tier: 'pro', retained: true },
        timestamp: '2026-09-21T10:00:00.000Z',
      },
    });
    expect(records[1].payload).not.toHaveProperty('session_id');
    const set = normalizePostHogEvent(
      event({ event: '$set', $set: { tier: 'free' } }),
      'production'
    );
    expect(set[1]).toMatchObject({
      type: 'identify',
      payload: { traits: { tier: 'free' } },
    });
    const noTraits = normalizePostHogEvent(
      event({ event: '$identify' }),
      'production'
    );
    expect(noTraits[1]).toMatchObject({ payload: { traits: {} } });
  });

  it('maps aliases and retains unsupported group operations as analytics data', () => {
    const records = normalizePostHogEvent(
      event({
        event: '$create_alias',
        properties: { distinct_id: 'old', alias: 'new' },
      }),
      'production'
    );
    expect(records[1]).toMatchObject({
      type: 'alias',
      payload: {
        distinct_id: 'old',
        new_user_id: 'new',
        timestamp: '2026-09-21T10:00:00.000Z',
      },
    });
    expect(
      normalizePostHogEvent(event({ event: '$groupidentify' }), 'production')
    ).toHaveLength(1);
  });

  it.each(['$snapshot', '$$heatmap'])(
    'excludes %s transport payloads before copying their data',
    name => {
      expect(normalizePostHogEvent({ event: name }, 'production')).toEqual([]);
    }
  );

  it.each([
    null,
    [],
    {},
    { event: '' },
    { event: 'event', properties: null },
    event({ properties: { distinct_id: ' ' } }),
    event({ properties: { distinct_id: 123 } }),
    event({ timestamp: undefined }),
    event({ timestamp: new Date('invalid') }),
    event({ timestamp: 'invalid' }),
    event({ properties: { distinct_id: '$posthog_cookieless' } }),
    event({ properties: { distinct_id: 'user', $cookieless_mode: true } }),
    event({
      properties: { distinct_id: 'user', $altertable_source: 'custom' },
    }),
    event({ event: '$create_alias' }),
  ])('rejects malformed or unsupported source data (%#)', value => {
    expect(() => normalizePostHogEvent(value, 'production')).toThrow();
  });
});

describe('configured adapters', () => {
  let client: Altertable;
  let adapter: ReturnType<typeof createAdapter>;
  const cleanups: Array<() => void> = [];
  function init(options: AltertableConfig = {}) {
    const cleanup = client.init('altertable-key', {
      adapters: { posthog: adapter },
      persistence: 'memory',
      eventPersistence: false,
      flushIntervalMs: 10000,
      ...options,
    });
    cleanups.push(cleanup);
    return cleanup;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    setupBeaconAvailable();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    client = new Altertable();
    adapter = createAdapter();
  });
  afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not transform adapter events', async () => {
    const transformEvent = vi.fn(() => null);
    init({ transformEvent });
    adapter.emit(event());
    await client.flush();
    expect(transformEvent).not.toHaveBeenCalled();
    expect(requests().map(row => row.event)).toEqual(['Checkout']);
  });

  it('batches adapter events and ignores native track', async () => {
    init();
    adapter.emit(event());
    client.track('Native');
    expect(fetch).not.toHaveBeenCalled();
    await client.flush();
    expect(requests().map(row => row.event)).toEqual(['Checkout']);
    expect(requests()[0].distinct_id).toBe('customer');
  });

  it('preserves buffered events and native session state when reset is called', async () => {
    init();
    const sessionManager = client['_sessionManager'];
    const originalSession = {
      anonymousId: sessionManager.getAnonymousId(),
      deviceId: sessionManager.getDeviceId(),
      distinctId: sessionManager.getDistinctId(),
      sessionId: sessionManager.getSessionId(),
    };

    adapter.emit(event({ event: 'Buffered' }));
    expect(() => client.reset({ resetDeviceId: true })).toWarnDev(
      IGNORED_ALTERTABLE_CALL_WARNING
    );

    expect({
      anonymousId: sessionManager.getAnonymousId(),
      deviceId: sessionManager.getDeviceId(),
      distinctId: sessionManager.getDistinctId(),
      sessionId: sessionManager.getSessionId(),
    }).toEqual(originalSession);
    await client.flush();
    expect(requests().map(row => row.event)).toEqual(['Buffered']);

    client.configure({ adapters: {} });
    client.reset({ resetDeviceId: true });
    expect(sessionManager.getDeviceId()).not.toBe(originalSession.deviceId);
    expect(sessionManager.getDistinctId()).not.toBe(originalSession.distinctId);
    expect(sessionManager.getSessionId()).not.toBe(originalSession.sessionId);
  });

  it('skips identity validation until the adapter is removed', () => {
    init();

    expect(() => client.identify('')).not.toThrow();
    expect(() => client.identify('anonymous_id')).not.toThrow();
    expect(() => client.alias('')).not.toThrow();
    expect(() => client.alias('anonymous_id')).not.toThrow();

    client.configure({ adapters: {} });
    expect(() => client.identify('')).toThrow(
      '[Altertable] User ID cannot be empty or contain only whitespace.'
    );
    expect(() => client.alias('anonymous_id')).toThrow(
      '[Altertable] User ID "anonymous_id" is a reserved identifier and cannot be used.'
    );
  });

  it.each([{ adapters: {} }, { adapters: { posthog: undefined } }])(
    'retains native autocapture when no adapter is configured (%j)',
    async options => {
      init(options);
      await client.flush();
      expect(requests().map(row => row.event)).toEqual(['$pageview']);
    }
  );

  it('keeps autocapture off when it is explicitly enabled beside an adapter', async () => {
    init({ autoCapture: true });
    await client.flush();
    expect(requests()).toEqual([]);
  });

  it('replaces adapters without dropping buffered events or changing native identity', async () => {
    const cleanup = init();
    adapter.emit(event({ event: 'Buffered' }));
    const replacement = createAdapter();
    client.configure({ adapters: { posthog: replacement } });
    adapter.emit(event({ event: 'Detached' }));
    replacement.emit(event({ event: 'Replacement' }));
    client.configure({ adapters: { posthog: replacement } });
    expect(replacement.on).toHaveBeenCalledOnce();
    expect(adapter.unsubscribe).toHaveBeenCalledOnce();
    await client.flush();
    expect(requests().map(row => row.event)).toEqual([
      'Buffered',
      'Replacement',
    ]);
    client.track('After');
    await client.flush();
    expect(requests()).toHaveLength(2);
    client.configure({ adapters: {} });
    client.track('Native');
    await client.flush();
    const native = requests().find(row => row.event === 'Native');
    expect(native.distinct_id).toMatch(new RegExp(`^${PREFIX_ANONYMOUS_ID}-`));
    expect(native.distinct_id).not.toBe('customer');
    cleanup();
    expect(replacement.unsubscribe).toHaveBeenCalledOnce();
  });

  it('updates automatic capture defaults when adding and removing adapters', async () => {
    init({ adapters: {} });
    client.configure({ adapters: { posthog: adapter } });
    client.configure({ debug: false });
    adapter.emit(event());
    client.configure({ adapters: {} });
    adapter.emit(event({ event: 'Detached' }));
    await client.flush();
    expect(requests().map(row => row.event)).toEqual([
      '$pageview',
      'Checkout',
      '$pageview',
    ]);
  });

  it.each([true, false])(
    'restores explicit autocapture=%s only after the adapter is removed',
    async autoCapture => {
      init({ autoCapture });
      await client.flush();
      expect(requests()).toEqual([]);
      client.configure({ adapters: {} });
      await client.flush();
      expect(requests().map(row => row.event)).toEqual(
        autoCapture ? ['$pageview'] : []
      );
    }
  );

  it('does not let an explicit autocapture override collect while an adapter is set', async () => {
    init();
    client.configure({ autoCapture: true });
    await client.flush();
    expect(requests()).toEqual([]);
    client.configure({ adapters: undefined });
    await client.flush();
    expect(requests().map(row => row.event)).toEqual(['$pageview']);
    client.configure({
      autoCapture: undefined,
      adapters: { posthog: adapter },
    });
    adapter.emit(event());
    await client.flush();
    expect(requests().map(row => row.event)).toEqual(['$pageview', 'Checkout']);
  });

  it.each(['pending', 'dismissed'] as const)(
    'buffers immutable source context during %s consent',
    async trackingConsent => {
      init({ trackingConsent });
      const input = event();
      adapter.emit(input);
      input.properties.cart.total = 999;
      await client.flush();
      expect(fetch).not.toHaveBeenCalled();
      client.configure({ trackingConsent: 'granted' });
      await client.flush();
      expect(requests()).toMatchObject([
        {
          distinct_id: 'customer',
          timestamp: '2026-09-21T10:00:00.000Z',
          properties: { cart: { total: 42 } },
        },
      ]);
    }
  );

  it('drops denied events and discards buffered events on revocation', async () => {
    init({ trackingConsent: 'pending' });
    adapter.emit(event());
    client.configure({ trackingConsent: 'denied' });
    adapter.emit(event());
    client.configure({ trackingConsent: 'granted' });
    await client.flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('isolates throwing error callbacks from the provider', async () => {
    const onError = vi.fn(() => {
      throw new Error('customer error');
    });
    init({ onError });
    expect(() => adapter.emit({})).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('routes identity records without changing native identity', async () => {
    init();
    adapter.emit(
      event({
        event: '$identify',
        properties: {
          distinct_id: 'source-user',
          $anon_distinct_id: 'source-anon',
        },
        $set: { name: 'Test' },
      })
    );
    adapter.emit(
      event({
        event: '$create_alias',
        properties: { distinct_id: 'source-user', alias: 'next-user' },
      })
    );
    await client.flush();
    expect(requests('/identify')[0]).toMatchObject({
      distinct_id: 'source-user',
      anonymous_id: 'source-anon',
      traits: { name: 'Test' },
    });
    expect(requests('/alias')[0]).toMatchObject({
      distinct_id: 'source-user',
      new_user_id: 'next-user',
    });
    client.configure({ adapters: {} });
    client.track('Native');
    await client.flush();
    const native = requests().find(row => row.event === 'Native');
    expect(native.distinct_id).toMatch(new RegExp(`^${PREFIX_ANONYMOUS_ID}-`));
    expect(native.distinct_id).not.toBe('source-user');
  });

  it('ignores native writes while an adapter is configured and allows them again after removal', async () => {
    expect(() => {
      client.track('Queued');
      client.identify('queued-user', { plan: 'queued' });
      client.alias('queued-alias');
      client.page('https://example.com/queued');
      client.updateTraits({ plan: 'queued' });
      init();
    }).toWarnDev(IGNORED_ALTERTABLE_CALL_WARNING);
    expect(() => {
      client.track('Native');
      client.page('https://example.com/native');
      client.identify('user-1', { plan: 'pro' });
      client.alias('other-user');
      client.updateTraits({ plan: 'enterprise' });
    }).not.toWarnDev();
    await client.flush();
    expect(fetch).not.toHaveBeenCalled();

    expect(() => {
      client.configure({ adapters: {} });
      client.track('Restored');
    }).not.toWarnDev();
    await client.flush();
    const restored = requests();
    expect(restored.map(row => row.event)).toEqual(['$pageview', 'Restored']);
    expect(restored[0].distinct_id).toBe(restored[1].distinct_id);
    expect(restored[0].distinct_id).toMatch(
      new RegExp(`^${PREFIX_ANONYMOUS_ID}-`)
    );
    expect(requests('/identify')).toEqual([]);
    expect(requests('/alias')).toEqual([]);

    expect(() => {
      client.configure({ adapters: { posthog: adapter } });
      client.track('Blocked again');
    }).not.toWarnDev();
    await client.flush();
    expect(requests().map(row => row.event)).toEqual(['$pageview', 'Restored']);
  });

  it('detaches once and ignores stale cleanup after reinitialization', async () => {
    const first = init();
    const staleListener = adapter.on.mock.calls[0][1];
    const second = init();
    first();
    staleListener(event({ event: 'stale' }));
    adapter.emit(event());
    await client.flush();
    expect(requests()).toHaveLength(1);
    expect(adapter.unsubscribe).toHaveBeenCalledTimes(1);
    second();
    second();
    adapter.emit(event());
    await client.flush();
    expect(requests()).toHaveLength(1);
    expect(adapter.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('drops old unsent adapter records when the destination is reinitialized', async () => {
    init();
    adapter.emit(event({ event: 'old' }));
    init({ environment: 'staging' });
    adapter.emit(event({ event: 'new' }));
    await client.flush();
    expect(requests()).toMatchObject([
      { event: 'new', environment: 'staging' },
    ]);
  });

  it('contains subscription failures without enabling native collection', async () => {
    const onError = vi.fn();
    init({
      adapters: {
        posthog: {
          on: () => {
            throw 'failure';
          },
        },
      },
      onError,
    });
    await client.flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('contains unsubscribe errors', () => {
    const onError = vi.fn();
    const cleanup = init({
      adapters: {
        posthog: {
          on: () => () => {
            throw new Error('unsubscribe');
          },
        },
      },
      onError,
    });
    expect(cleanup).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('flushes a late adapter event without resending events already delivered on unload', async () => {
    init();
    adapter.emit(event({ event: 'Buffered' }));
    const captureLeave = () => adapter.emit(event({ event: '$pageleave' }));
    window.addEventListener('pagehide', captureLeave);
    window.dispatchEvent(new Event('pagehide'));
    window.removeEventListener('pagehide', captureLeave);
    const beacon = vi.mocked(navigator.sendBeacon);
    expect(beacon).toHaveBeenCalledTimes(2);
    const bodies = await Promise.all(
      beacon.mock.calls.map(async call =>
        JSON.parse(await (call[1] as Blob).text())
      )
    );
    expect(bodies[0].map((record: { event: string }) => record.event)).toEqual([
      'Buffered',
    ]);
    expect(bodies[1].map((record: { event: string }) => record.event)).toEqual([
      '$pageleave',
    ]);
  });

  it('flushes late page-leave events after the earlier Altertable pagehide listener', async () => {
    init();
    const captureLeave = () => adapter.emit(event({ event: '$pageleave' }));
    window.addEventListener('pagehide', captureLeave);
    window.dispatchEvent(new Event('pagehide'));
    window.removeEventListener('pagehide', captureLeave);
    expect(navigator.sendBeacon).toHaveBeenCalledOnce();
    const blob = vi.mocked(navigator.sendBeacon).mock.calls[0][1] as Blob;
    expect(JSON.parse(await blob.text())[0].event).toBe('$pageleave');
    window.dispatchEvent(new Event('pageshow'));
    adapter.emit(event());
    expect(navigator.sendBeacon).toHaveBeenCalledOnce();
  });

  it('persists adapter events offline and replays after a new client starts', async () => {
    localStorage.clear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const cleanup = init({ eventPersistence: 'localStorage' });
    adapter.emit(event());
    await client.flush();
    expect(fetch).not.toHaveBeenCalled();
    cleanup();
    client = new Altertable();
    init({ eventPersistence: 'localStorage' });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await client.flush();
    expect(requests()).toMatchObject([
      { distinct_id: 'customer', timestamp: '2026-09-21T10:00:00.000Z' },
    ]);
    localStorage.clear();
  });

  it('isolates non-serializable properties and continues with subsequent events', async () => {
    const onError = vi.fn();
    init({ onError });
    const circular: Record<string, unknown> = { distinct_id: 'user' };
    circular.self = circular;
    expect(() => adapter.emit(event({ properties: circular }))).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    adapter.emit(event());
    await client.flush();
    expect(requests()).toHaveLength(1);
  });

  it('retries failed delivery without recapturing or changing the adapter snapshot', async () => {
    init({ flushEventThreshold: 1 });
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    expect(() => adapter.emit(event())).not.toThrow();
    const firstBody = vi.mocked(fetch).mock.calls[0][1]!.body;
    await vi.advanceTimersByTimeAsync(5000);
    await client.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][1]!.body).toBe(firstBody);
    expect(adapter.on).toHaveBeenCalledOnce();
  });

  it('does not subscribe without a browser', () => {
    vi.stubGlobal('window', undefined);
    init();
    expect(adapter.on).not.toHaveBeenCalled();
  });
});
