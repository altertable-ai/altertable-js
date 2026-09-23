import { cleanup, render } from '@testing-library/react';
import posthog, { type PostHog, type PostHogConfig } from 'posthog-js';
import React, { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { setupBeaconAvailable } from '../../../test-utils/networkMode';
import { Altertable } from '../../altertable-js/src/core';
import type { PostHogAdapter } from '../../altertable-js/src/adapters/types';

export function testPostHogProvider(
  PostHogProvider: typeof import('posthog-js/react').PostHogProvider,
  usePostHog: typeof import('posthog-js/react').usePostHog
) {
  const options: Partial<PostHogConfig> = {
    api_host: 'https://posthog.invalid',
    persistence: 'memory',
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_decide: true,
    disable_external_dependency_loading: true,
  };
  let dispose: (() => void) | undefined;
  let active: PostHog;
  let client: Altertable;
  const errors: Error[] = [];
  function attach(adapter: PostHogAdapter) {
    dispose = client.init('altertable-test', {
      adapters: { posthog: adapter },
      persistence: 'memory',
      eventPersistence: false,
      onError: error => errors.push(error),
    });
  }
  function events() {
    return vi
      .mocked(fetch)
      .mock.calls.filter(([url]) =>
        String(url).includes('api.altertable.ai/track')
      )
      .flatMap(([, request]) => JSON.parse(request!.body as string));
  }
  function Consumer() {
    const adapter = usePostHog();
    return <button onClick={() => adapter.capture('Clicked')}>Capture</button>;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    setupBeaconAvailable();
    vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    client = new Altertable();
    errors.length = 0;
  });
  afterEach(() => {
    cleanup();
    dispose?.();
    active?.opt_out_capturing();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('attaches inside a provider-owned loaded callback before startup, surviving StrictMode and remounts', async () => {
    active = posthog;
    const existingLoaded = vi.fn(
      (adapter: Parameters<NonNullable<PostHogConfig['loaded']>>[0]) =>
        adapter.capture('Customer startup')
    );
    const loaded = vi.fn(
      (adapter: Parameters<NonNullable<PostHogConfig['loaded']>>[0]) => {
        attach(adapter);
        existingLoaded(adapter);
      }
    );
    const tree = (
      <StrictMode>
        <PostHogProvider
          apiKey="framework-test"
          options={{ ...options, loaded }}
        >
          <Consumer />
        </PostHogProvider>
      </StrictMode>
    );

    // SSR renders the provider without running its initialization effect.
    renderToString(tree);
    expect(loaded).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    const view = render(tree);
    await vi.advanceTimersByTimeAsync(10);
    view.getByText('Capture').click();
    await client.flush();
    expect(loaded).toHaveBeenCalledOnce();
    expect(existingLoaded).toHaveBeenCalledOnce();
    expect(events().map(event => event.event)).toEqual([
      'Customer startup',
      '$pageview',
      'Clicked',
    ]);

    // Provider rerenders and remounts do not own the application-level subscription.
    view.rerender(tree);
    view.unmount();
    const remounted = render(tree);
    remounted.getByText('Capture').click();
    await client.flush();
    expect(loaded).toHaveBeenCalledOnce();
    expect(events().filter(event => event.event === '$pageview')).toHaveLength(
      1
    );
    expect(events().filter(event => event.event === 'Clicked')).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it('supports a named client initialized at framework bootstrap and reattachment after HMR cleanup', async () => {
    // The loaded callback supplies the named client rather than the imported default.
    active = posthog.init(
      'framework-named',
      {
        ...options,
        loaded(adapter) {
          attach(adapter);
          adapter.capture('Named startup');
        },
      },
      'framework-client'
    );
    const tree = (
      <StrictMode>
        <PostHogProvider client={active}>
          <Consumer />
        </PostHogProvider>
      </StrictMode>
    );
    const view = render(tree);
    await vi.advanceTimersByTimeAsync(10);
    view.getByText('Capture').click();
    await client.flush();
    expect(events().map(event => event.event)).toEqual([
      'Named startup',
      '$pageview',
      'Clicked',
    ]);
    expect(
      events().every(event => event.distinct_id === active.get_distinct_id())
    ).toBe(true);

    const oldCleanup = dispose!;
    await client.flush();
    oldCleanup();
    attach(active);
    oldCleanup();
    active.init('framework-named', options); // PostHog's second init is a no-op.
    client.configure({ adapters: { posthog: active } });
    view.rerender(tree);
    view.getByText('Capture').click();
    await client.flush();
    expect(events().filter(event => event.event === 'Clicked')).toHaveLength(2);
    expect(events().filter(event => event.event === '$pageview')).toHaveLength(
      1
    );
    expect(errors).toEqual([]);
  });
}
