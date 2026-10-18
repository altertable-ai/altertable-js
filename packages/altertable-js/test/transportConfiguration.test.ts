// @vitest-environment node

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPlatformRuntime } from '../../../test-utils/platformRuntime';
import { Altertable, type AltertableConfig, type StorageAdapter } from '../src';

let cleanup: (() => void) | undefined;
const endpointA = 'https://first.example.com';
const endpointB = 'https://second.example.com';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function init(options: AltertableConfig = {}) {
  const host = createPlatformRuntime();
  const client = new Altertable(host.platform);
  cleanup = client.init('key', {
    baseUrl: endpointA,
    persistence: 'memory',
    autoCapture: false,
    flushIntervalMs: 1_000_000,
    ...options,
  });
  return { client, host };
}

it('uses the configured endpoint for new sends while an in-flight request retries its original endpoint', async () => {
  const response = Promise.withResolvers<Response>();
  vi.mocked(fetch).mockReturnValueOnce(response.promise);
  const { client } = init();
  client.track('Underway');
  const underway = client.flush({ drain: false });
  client.configure({ baseUrl: endpointB });
  client.track('Subsequent');
  await client.flush({ drain: false });
  response.resolve({
    ok: false,
    status: 503,
    statusText: 'Unavailable',
    json: async () => ({}),
  } as Response);
  await vi.advanceTimersByTimeAsync(60_000);
  await underway;
  expect(
    vi.mocked(fetch).mock.calls.map(([url, options]) => ({
      url,
      events: JSON.parse(options!.body as string).map(
        (event: { event: string }) => event.event
      ),
    }))
  ).toEqual([
    { url: `${endpointA}/track?apiKey=key`, events: ['Underway'] },
    { url: `${endpointB}/track?apiKey=key`, events: ['Subsequent'] },
    { url: `${endpointA}/track?apiKey=key`, events: ['Underway'] },
  ]);
});

it('applies endpoint changes before configuration triggers a threshold flush', async () => {
  const { client } = init();
  client.track('Buffered');
  client.configure({ baseUrl: endpointB, flushEventThreshold: 1 });
  await client.flush();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    `${endpointB}/track?apiKey=key`,
    expect.objectContaining({ method: 'POST' })
  );
});

it('uses the configured endpoint for subsequent best-effort exit delivery', () => {
  const { client, host } = init();
  const requests: Array<{ url: string; body: string }> = [];
  host.platform.sendOnExit = request => requests.push(request);
  client.track('Leaving');
  client.configure({ baseUrl: endpointB });
  host.emit('exit');
  expect(requests).toEqual([
    expect.objectContaining({ url: `${endpointB}/track?apiKey=key` }),
  ]);
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps the original endpoint when storage migration prevents configuration from committing', async () => {
  const values = new Map<string, string>();
  const failure = new Error('Storage read failed');
  let failReads = false;
  const storage: StorageAdapter = {
    getItem(key) {
      if (failReads) throw failure;
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
      return true;
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const { client } = init({ persistence: storage });
  failReads = true;
  expect(() =>
    client.configure({ baseUrl: endpointB, persistence: 'memory' })
  ).toThrow(failure);
  client.track('Original Destination');
  await client.flush();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    `${endpointA}/track?apiKey=key`,
    expect.any(Object)
  );
});

it('applies the endpoint before a consent grant sends queued events', async () => {
  const { client } = init({
    trackingConsent: 'pending',
    flushEventThreshold: 1,
  });
  client.track('Queued');
  expect(fetch).not.toHaveBeenCalled();
  client.configure({ baseUrl: endpointB, trackingConsent: 'granted' });
  await client.flush();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    `${endpointB}/track?apiKey=key`,
    expect.any(Object)
  );
});
