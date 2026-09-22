import posthog, { type CaptureResult, PostHog } from 'posthog-js';
import minimumPosthog, { PostHog as MinimumPostHog } from 'posthog-js-minimum';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupBeaconAvailable } from '../../../test-utils/networkMode';
import { Altertable } from '../src/core';

// Both are actual npm singleton instances; no PostHog methods are mocked.
describe.each([
  ['1.230.0', minimumPosthog, MinimumPostHog],
  ['1.434.3', posthog, PostHog],
] as const)('PostHog %s compatibility', (_version, singleton, Constructor) => {
  let adapter: PostHog | MinimumPostHog;
  let client: Altertable;
  let cleanup: (() => void) | undefined;
  const errors: Error[] = [];
  const config = {
    api_host: 'https://posthog.invalid',
    persistence: 'memory' as const,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_decide: true,
    disable_external_dependency_loading: true,
  };
  function attach() {
    cleanup = client.init('altertable-test', {
      adapters: { posthog: adapter },
      persistence: 'memory' as const,
      eventPersistence: false,
      flushIntervalMs: 10000,
      onError: error => errors.push(error),
    });
  }
  function rows(path = '/track') {
    return vi
      .mocked(fetch)
      .mock.calls.filter(([url]) =>
        String(url).includes(`api.altertable.ai${path}`)
      )
      .flatMap(([, request]) => JSON.parse(request!.body as string));
  }
  beforeEach(() => {
    vi.useFakeTimers();
    setupBeaconAvailable();
    vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {});
    errors.length = 0;
    client = new Altertable();
    adapter = new Constructor();
    localStorage.clear();
    for (const cookie of document.cookie.split(';')) {
      document.cookie = cookie.split('=')[0].trim() + '=; Max-Age=0; path=/';
    }
  });
  afterEach(() => {
    cleanup?.();
    adapter.opt_out_capturing();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('subscribes before init and captures loaded events and exactly one initial pageview', async () => {
    adapter = singleton;
    attach();
    adapter.init('posthog-test', {
      ...config,
      capture_pageview: true,
      loaded: ph => ph.capture('During loaded'),
    });
    adapter.opt_in_capturing({ captureEventName: false });
    await vi.advanceTimersByTimeAsync(10);
    await client.flush();
    expect(errors).toEqual([]);
    expect(rows().filter(row => row.event === '$pageview')).toHaveLength(1);
    expect(rows().filter(row => row.event === 'During loaded')).toHaveLength(1);
    expect(rows()[0].distinct_id).toBe(adapter.get_distinct_id());
    cleanup!();
    adapter.capture('After detach');
    await client.flush();
    expect(rows().some(row => row.event === 'After detach')).toBe(false);
  });

  it('supports the advanced loaded setup for a named instance', async () => {
    adapter = singleton.init(
      'named-posthog-test',
      {
        ...config,
        capture_pageview: true,
        loaded(ph) {
          cleanup = client.init('altertable-test', {
            adapters: { posthog: ph },
            persistence: 'memory',
            eventPersistence: false,
            onError: error => errors.push(error),
          });
          ph.capture('Named startup');
        },
      },
      'advanced'
    );
    await vi.advanceTimersByTimeAsync(10);
    await client.flush();
    expect(errors).toEqual([]);
    expect(rows().map(row => row.event)).toEqual([
      'Named startup',
      '$pageview',
    ]);
    cleanup!();
    adapter.capture('After detach');
    await client.flush();
    expect(rows()).toHaveLength(2);
  });

  it('forwards real DOM autocapture and unload pageleave', async () => {
    attach();
    adapter.init('posthog-dom-test', {
      ...config,
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
    });
    await vi.advanceTimersByTimeAsync(10);
    const button = document.createElement('button');
    button.textContent = 'Buy';
    document.body.append(button);
    button.click();
    button.remove();
    await client.flush();
    expect(errors).toEqual([]);
    expect(rows().some(row => row.event === '$autocapture')).toBe(true);
    window.dispatchEvent(new Event('pagehide'));
    const beacons = vi
      .mocked(navigator.sendBeacon)
      .mock.calls.filter(([url]) => String(url).includes('api.altertable.ai'));
    const payloads = (
      await Promise.all(
        beacons.map(async ([, body]) => JSON.parse(await (body as Blob).text()))
      )
    ).flat();
    expect(payloads.some(row => row.event === '$pageleave')).toBe(true);
  });

  it('sees only post-filter payloads, preserves event time, and leaves PostHog payloads unchanged', async () => {
    attach();
    adapter.init('posthog-test', {
      ...config,
      before_send: (value: CaptureResult) => {
        if (value.event === 'Drop') return null;
        if (value.properties) delete value.properties.secret;
        return value;
      },
    });
    adapter.opt_in_capturing({ captureEventName: false });
    const timestamp = new Date('2026-09-21T10:00:00.000Z');
    const result = adapter.capture(
      'Purchase',
      { secret: 'sensitive', amount: 42 },
      { timestamp }
    );
    adapter.capture('Drop');
    await client.flush();
    expect(errors).toEqual([]);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      event: 'Purchase',
      timestamp: timestamp.toISOString(),
      distinct_id: result!.properties!.distinct_id,
    });
    expect(rows()[0].properties.secret).toBeUndefined();
    expect(rows()[0].properties.token).toBeUndefined();
    expect(rows()[0].properties.$altertable_source.event_id).toBe(result!.uuid);
    expect(result!.properties!.token).toBe('posthog-test');
    expect(result!.properties!.$altertable_source).toBeUndefined();
  });

  it('maps anonymous identification, trait updates, aliases, and reset without merging new visitors', async () => {
    attach();
    adapter.init('posthog-test', config);
    adapter.opt_in_capturing({ captureEventName: false });
    adapter.reset();
    const anonymousId = adapter.get_distinct_id();
    adapter.capture('Anonymous');
    adapter.identify('user-a', { plan: 'pro' }, { first_plan: 'free' });
    adapter.setPersonProperties({ plan: 'enterprise' });
    adapter.alias('user-alias', 'user-a');
    adapter.reset();
    const nextAnonymousId = adapter.get_distinct_id();
    adapter.capture('New visitor');
    await client.flush();
    expect(errors).toEqual([]);
    expect(rows('/identify')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          distinct_id: 'user-a',
          anonymous_id: anonymousId,
          traits: expect.objectContaining({ plan: 'pro' }),
        }),
        expect.objectContaining({
          distinct_id: 'user-a',
          traits: expect.objectContaining({ plan: 'enterprise' }),
        }),
      ])
    );
    expect(
      rows('/identify').every(row => row.traits.first_plan === undefined)
    ).toBe(true);
    expect(rows('/alias')).toMatchObject([
      { distinct_id: 'user-a', new_user_id: 'user-alias' },
    ]);
    expect(nextAnonymousId).not.toBe(anonymousId);
    expect(rows().find(row => row.event === 'New visitor')).toMatchObject({
      distinct_id: nextAnonymousId,
      anonymous_id: null,
    });
  });
});
