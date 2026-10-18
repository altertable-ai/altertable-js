// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTO_CAPTURE_INTERVAL_MS } from '../src/constants';
import { Altertable } from '../src/core';

describe('non-browser runtimes', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['no window', undefined],
    ['React Native window alias', globalThis],
    ['document without browser location', { document: {} }],
    ['location without document', { location: { href: 'app://home' } }],
  ])('initializes and delivers events with %s', async (_name, windowValue) => {
    vi.stubGlobal('window', windowValue);
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const client = new Altertable();

    client.track('Before Init', { source: 'native' });
    cleanup = client.init('test-key');
    client.identify('user-123');
    client.track('After Init');
    await client.flush();

    const payloads = vi
      .mocked(fetch)
      .mock.calls.flatMap(([, options]) => JSON.parse(options!.body as string));
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'Before Init',
          properties: expect.objectContaining({ source: 'native', $url: null }),
        }),
        expect.objectContaining({
          event: 'After Init',
          distinct_id: 'user-123',
          properties: expect.objectContaining({ $url: null }),
        }),
      ])
    );

    client.configure({ autoCapture: true });
    expect(setInterval).not.toHaveBeenCalledWith(
      expect.any(Function),
      AUTO_CAPTURE_INTERVAL_MS
    );
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('imports the public entry point without installing a browser global', async () => {
    vi.stubGlobal('window', globalThis);
    const { altertable } = await import('../src');

    expect(Object.hasOwn(globalThis, 'Altertable')).toBe(false);
    cleanup = altertable.init('test-key', {
      autoCapture: false,
      persistence: 'memory',
      eventPersistence: false,
    });
    altertable.track('Native Event');
    await altertable.flush();
    expect(fetch).toHaveBeenCalled();
  });
});
