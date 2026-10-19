import { afterEach, expect, it, vi } from 'vitest';

import { Altertable, getStorageKeys } from '../src';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
});

it('accepts and ignores deprecated environment options, warning once in development', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const send = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ ok: true } as Response);
  const transformEvent = vi.fn(event => ({
    ...event,
    environment: 'injected',
  }));
  const client = new Altertable({ getContext: () => ({}) });
  cleanup = client.init('environment-key', {
    persistence: 'memory',
    environment: 'staging',
    transformEvent,
  });
  client.track('First', { environment: 'business-property' });
  client.configure({ environment: 'production' });
  client.identify('user-123');
  client.updateTraits({ tier: 'pro' });
  client.alias('other-user');
  client.track('Second');
  await client.flush();
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    '[Altertable] The environment is determined by your API key. Remove the `environment` option.'
  );
  for (const [payload] of transformEvent.mock.calls)
    expect(payload).not.toHaveProperty('environment');
  const payloads = send.mock.calls.flatMap(([, options]) =>
    JSON.parse(options!.body as string)
  );
  expect(payloads).toHaveLength(5);
  for (const payload of payloads)
    expect(payload).not.toHaveProperty('environment');
  expect(
    payloads.find(payload => payload.event === 'First').properties.environment
  ).toBe('business-property');
  expect(getStorageKeys('environment-key', 'staging')).toEqual(
    getStorageKeys('environment-key')
  );
  expect(getStorageKeys('other-key')).not.toEqual(
    getStorageKeys('environment-key')
  );
});
