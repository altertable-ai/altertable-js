import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPlatformRuntime } from '../../../test-utils/platformRuntime';
import {
  Altertable,
  getStorageKeys,
  type AltertableConfig,
  type AudienceTrackPayload,
  type StorageAdapter,
  type TrackPayload,
} from '../src';

const cleanups: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function start(config: AltertableConfig = {}, client = new Altertable()) {
  cleanups.push(
    client.init('key', {
      trackingMode: 'audience',
      autoCapture: false,
      flushIntervalMs: 1_000_000,
      ...config,
    })
  );
  return client;
}

function events(): Array<TrackPayload | AudienceTrackPayload> {
  return vi
    .mocked(fetch)
    .mock.calls.filter(
      ([url]) => typeof url === 'string' && url.includes('/track?')
    )
    .flatMap(([, options]) => JSON.parse(options!.body as string));
}

function expectNoIdentity(payload: TrackPayload | AudienceTrackPayload) {
  expect(payload).toHaveProperty('processing_mode', 'audience');
  for (const field of [
    'distinct_id',
    'anonymous_id',
    'device_id',
    'session_id',
  ]) {
    expect(payload).not.toHaveProperty(field);
  }
}

it('does not access existing identity, consent, or offline events in browser storage', async () => {
  const keys = getStorageKeys('key');
  localStorage.setItem(keys.session, JSON.stringify({ distinctId: 'account' }));
  localStorage.setItem(keys.events, 'previous offline data');
  const read = vi.spyOn(Storage.prototype, 'getItem');
  const write = vi.spyOn(Storage.prototype, 'setItem');
  const remove = vi.spyOn(Storage.prototype, 'removeItem');
  const readCookie = vi.spyOn(document, 'cookie', 'get');
  const writeCookie = vi.spyOn(document, 'cookie', 'set');
  const client = start({
    persistence: 'localStorage+cookie',
    eventPersistence: 'sessionStorage',
  });
  client.track('Docs Opened', { section: 'installation' });
  await client.flush();
  client.configure({
    persistence: 'cookie',
    eventPersistence: 'localStorage',
    trackingMode: undefined,
  });
  client.track('Install Copied');
  await client.flush();
  expect(events().map(event => event.event)).toEqual([
    'Docs Opened',
    'Install Copied',
  ]);
  events().forEach(expectNoIdentity);
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(readCookie).not.toHaveBeenCalled();
  expect(writeCookie).not.toHaveBeenCalled();
});

it('does not hydrate custom storage adapters even when persistence is explicitly supplied', async () => {
  const storage: StorageAdapter = {
    getItem: vi.fn(() => {
      throw new Error('Storage must not be read');
    }),
    setItem: vi.fn(() => {
      throw new Error('Storage must not be written');
    }),
    removeItem: vi.fn(() => {
      throw new Error('Storage must not be removed');
    }),
  };
  const client = start({ persistence: storage, eventPersistence: storage });
  client.track('Opened');
  await client.flush();
  expect(events()).toHaveLength(1);
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
});

it('drops identity commands queued before init and called after init', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const client = new Altertable();
  client.identify('queued-user', { email: 'queued@example.com' });
  client.alias('queued-alias');
  client.updateTraits({ name: 'Queued' });
  client.track('Before Init');
  start({}, client);
  client.identify('user', { email: 'user@example.com' });
  client.alias('alias-user');
  client.updateTraits({ name: 'User' });
  client.track('After Init');
  await client.flush();
  expect(events().map(event => event.event)).toEqual([
    'Before Init',
    'After Init',
  ]);
  events().forEach(expectNoIdentity);
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    '[Altertable] Altertable identify(), alias(), and updateTraits() calls were ignored because audience measurement is configured.'
  );
  expect(
    vi
      .mocked(fetch)
      .mock.calls.every(
        ([url]) => typeof url === 'string' && url.includes('/track?')
      )
  ).toBe(true);
});

it('reduces automatic page context on initial load and client-side navigation', async () => {
  const host = createPlatformRuntime();
  host.setContext({
    url: 'https://site.example/docs?email=person@example.com#secret',
    referrer: 'https://search.example/private?token=secret',
    viewport: '1234x987',
  });
  const client = start({ autoCapture: true }, new Altertable(host.platform));
  host.navigate('https://site.example/install?token=secret#code');
  client.track('Install Copied', { package: 'react' });
  await client.flush();
  expect(events().map(event => event.properties.$url)).toEqual([
    'https://site.example/docs',
    'https://site.example/install',
    'https://site.example/install',
  ]);
  expect(events()[0]!.properties.$referer).toBe('https://search.example');
  expect(events()[2]!.properties.package).toBe('react');
  for (const event of events()) {
    expectNoIdentity(event);
    expect(event.properties).not.toHaveProperty('$viewport');
    expect(event.properties).not.toHaveProperty('email');
    expect(event.properties).not.toHaveProperty('token');
  }
  expect(JSON.stringify(events())).not.toContain('secret');
});

it('enforces the mode after transforms and retains the caller properties', async () => {
  const transform = vi.fn(
    (event: TrackPayload): TrackPayload & { processing_mode: string } => ({
      ...event,
      processing_mode: 'product',
      distinct_id: 'injected-user',
      anonymous_id: 'anonymous-injected',
      device_id: 'device-injected',
      session_id: 'session-injected',
      properties: {
        ...event.properties,
        $url: 'https://user:password@site.example/docs?token=secret#hash',
        $referer: 'https://search.example/private?token=secret',
        $viewport: '1234x987',
      },
    })
  );
  const client = start({ transformEvent: transform });
  client.track('Docs Opened', { section: 'intro' });
  await client.flush();
  expect(events()[0]).toMatchObject({
    event: 'Docs Opened',
    properties: {
      $url: 'https://site.example/docs',
      $referer: 'https://search.example',
      section: 'intro',
    },
  });
  expectNoIdentity(events()[0]!);
  expect(transform).toHaveBeenCalledWith(
    expect.objectContaining({
      distinct_id: expect.any(String),
      anonymous_id: null,
      device_id: expect.any(String),
      session_id: expect.any(String),
    })
  );
  expect(events()[0]!.properties).not.toHaveProperty('$viewport');
});

it('does not let a product transform request audience processing for identified events', async () => {
  const client = start({
    trackingMode: 'product',
    persistence: 'localStorage',
    transformEvent: event => ({
      ...event,
      processing_mode: 'audience',
    }),
  });
  client.identify('signed-in');
  client.track('Account Opened', { processing_mode: 'business-value' });
  await client.flush();
  const event = events().find(payload => payload.event === 'Account Opened');
  expect(event).toMatchObject({
    distinct_id: 'signed-in',
    properties: { processing_mode: 'business-value' },
  });
  expect(event).not.toHaveProperty('processing_mode');
});

it.each([
  'not a URL?token=secret',
  'javascript:secret',
  '/relative?token=secret',
])('discards an unparseable or unsupported page URL: %s', async url => {
  const client = start();
  client.page(url);
  await client.flush();
  expect(events()[0]!.properties.$url).toBeNull();
});

it('keeps consent pending events in memory and discards denied events', async () => {
  const client = start({ trackingConsent: 'pending' });
  client.track('Waiting');
  await client.flush();
  expect(fetch).not.toHaveBeenCalled();
  client.configure({ trackingConsent: 'granted' });
  await client.flush();
  expect(events().map(event => event.event)).toEqual(['Waiting']);
  client.configure({ trackingConsent: 'denied' });
  client.track('Denied');
  await client.flush();
  expect(events()).toHaveLength(1);
});

it('does not replay offline events into a new page instance', async () => {
  const host = createPlatformRuntime();
  host.setOnline(false);
  const first = start({}, new Altertable(host.platform));
  first.track('Offline');
  await first.flush();
  expect(fetch).not.toHaveBeenCalled();
  cleanups.pop()!();
  const second = start();
  second.track('New Page');
  await second.flush();
  expect(events().map(event => event.event)).toEqual(['New Page']);
  events().forEach(expectNoIdentity);
});

it('omits credentials and the HTTP referrer on normal sends, retries, and browser exit', async () => {
  const beacon = vi.fn(() => true);
  vi.stubGlobal('navigator', { sendBeacon: beacon });
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 503,
  } as Response);
  const client = start();
  client.track('Retry');
  const flush = client.flush();
  await vi.advanceTimersByTimeAsync(4_000);
  await flush;
  expect(fetch).toHaveBeenCalledTimes(2);
  client.track('Exit');
  window.dispatchEvent(new Event('pagehide'));
  expect(beacon).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(3);
  for (const [, options] of vi.mocked(fetch).mock.calls) {
    expect(options).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
    });
  }
  events().forEach(expectNoIdentity);
});

it('rejects mode changes through configure and starts a fresh mode through init', async () => {
  const client = start();
  client.track('Discarded Buffer');
  // @ts-expect-error Exercise a mode change from an untyped JavaScript caller.
  expect(() => client.configure({ trackingMode: 'product' })).toThrow(
    'Call init()'
  );
  start({ trackingMode: 'product', persistence: 'memory' }, client);
  client.identify('signed-in');
  client.track('Identified');
  await client.flush();
  expect(events().some(event => event.event === 'Discarded Buffer')).toBe(
    false
  );
  expect(
    events().find(event => event.event === 'Identified')!.distinct_id
  ).toBe('signed-in');
  expect(
    events().find(event => event.event === 'Identified')
  ).not.toHaveProperty('processing_mode');
  start({}, client);
  client.track('Audience Again');
  await client.flush();
  expectNoIdentity(events().find(event => event.event === 'Audience Again')!);
});

it('rejects unsupported tracking modes before replacing an active client', async () => {
  const client = start();
  // @ts-expect-error Exercise an invalid mode supplied by an untyped JavaScript caller.
  expect(() => client.init('key', { trackingMode: 'anonymous' })).toThrow(
    'Invalid tracking mode. Use "product" or "audience".'
  );
  client.track('Still Active');
  await client.flush();
  expectNoIdentity(events()[0]!);
});

it('rejects adapters before replacing an active client', async () => {
  const client = start();
  const posthog = { on: vi.fn(() => () => {}) };
  expect(() =>
    client.init('key', { trackingMode: 'audience', adapters: { posthog } })
  ).toThrow('adapters');
  expect(() => client.configure({ adapters: { posthog } })).toThrow('adapters');
  client.track('Still Active');
  await client.flush();
  expect(events().map(event => event.event)).toEqual(['Still Active']);
  expect(posthog.on).not.toHaveBeenCalled();
});

it('keeps product events and identity when an audience initialization is rejected', async () => {
  const client = start({ trackingMode: 'product', persistence: 'memory' });
  client.identify('signed-in');
  client.track('Before Rejected Init');
  expect(() =>
    client.init('key', {
      trackingMode: 'audience',
      adapters: { posthog: { on: () => () => {} } },
    })
  ).toThrow('adapters');
  client.track('After Rejected Init');
  await client.flush();
  expect(events().map(event => event.event)).toEqual([
    'Before Rejected Init',
    'After Rejected Init',
  ]);
  for (const event of events()) {
    expect(event.distinct_id).toBe('signed-in');
    expect(event).not.toHaveProperty('processing_mode');
  }
});

it('preserves beacon delivery for product events on browser exit', () => {
  const beacon = vi.fn(() => true);
  vi.stubGlobal('navigator', { sendBeacon: beacon });
  const client = start({ trackingMode: 'product', persistence: 'memory' });
  client.track('Exit');
  window.dispatchEvent(new Event('pagehide'));
  expect(beacon).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});
