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

it('stores identity and events under the public environment-scoped keys', async () => {
  const { storage, values } = createStorage();
  const keys = getStorageKeys('key', 'staging');
  const client = new Altertable();
  cleanup = client.init('key', {
    persistence: storage,
    environment: 'staging',
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
  const client = new Altertable();
  cleanup = client.init('key', {
    persistence: 'memory',
    isOnline: () => online,
  });
  client.track('Offline');
  await client.flush();
  expect(fetch).not.toHaveBeenCalled();
  online = true;
  await client.flush();
  expect(fetch).toHaveBeenCalledOnce();
});
