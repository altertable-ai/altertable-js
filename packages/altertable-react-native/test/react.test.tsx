// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  AltertableProvider,
  createAltertable,
  type ReactNativeClient,
  useAltertable,
} from '../src';
import { createAsyncStorageMock, payloads } from './helpers';

let client: ReactNativeClient;

function wrapper({ children }: { children: ReactNode }) {
  return <AltertableProvider client={client}>{children}</AltertableProvider>;
}

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  client = await createAltertable('key', {
    storage: createAsyncStorageMock(),
    flushIntervalMs: 1_000_000,
  });
  await client.flush();
  vi.mocked(fetch).mockClear();
});

afterEach(async () => {
  await client.dispose();
  vi.unstubAllGlobals();
});

it('returns a stable client API that sends events through the provider client', async () => {
  const { result, rerender, unmount } = renderHook(useAltertable, { wrapper });
  const analytics = result.current;
  rerender();

  expect(result.current).toBe(analytics);
  expect(analytics).not.toBe(client);

  analytics.track('Purchase Completed', { amount: 42 });
  analytics.screen('Checkout', { id: 'order-1', properties: { total: 42 } });
  await analytics.flush();

  expect(payloads()).toEqual([
    expect.objectContaining({
      event: 'Purchase Completed',
      properties: expect.objectContaining({
        amount: 42,
        $lib: 'TEST_NATIVE_LIB',
        $lib_version: 'TEST_VERSION',
      }),
    }),
    expect.objectContaining({
      event: '$screen',
      properties: expect.objectContaining({
        total: 42,
        $view_name: 'Checkout',
        $view_id: 'order-1',
        $view_type: 'screen',
        $lib: 'TEST_NATIVE_LIB',
        $lib_version: 'TEST_VERSION',
      }),
    }),
  ]);
  unmount();
});

it('exposes every client method and funnel selection', () => {
  const { result, unmount } = renderHook(useAltertable, { wrapper });

  expect(Object.keys(result.current).sort()).toEqual(
    [...Object.keys(client), 'selectFunnel'].sort()
  );
  unmount();
});

type Funnels = {
  checkout: [
    { name: 'Cart Viewed'; properties: { itemCount: number } },
    { name: 'Order Completed'; properties: { total: number } },
  ];
};

it('tracks typed funnel steps', async () => {
  const { result, unmount } = renderHook(() => useAltertable<Funnels>(), {
    wrapper,
  });
  const checkout = result.current.selectFunnel('checkout');

  checkout.trackStep('Order Completed', { total: 42 });
  await result.current.flush();

  expect(payloads()).toEqual([
    expect.objectContaining({
      event: 'Order Completed',
      properties: expect.objectContaining({
        total: 42,
        $lib: 'TEST_NATIVE_LIB',
      }),
    }),
  ]);
  unmount();
});

it('requires a provider instead of silently using an uninitialized singleton', () => {
  expect(() => renderHook(useAltertable)).toThrow(
    '[Altertable] useAltertable() must be used within <AltertableProvider>.'
  );
});
