import { vi } from 'vitest';

export function createAsyncStorageMock() {
  const values = new Map<string, string>();

  return {
    values,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}

export function deferred<T>() {
  return Promise.withResolvers<T>();
}

/** Event payloads sent through the stubbed `fetch`, in order. */
export function payloads() {
  return vi
    .mocked(fetch)
    .mock.calls.flatMap(([, options]) => JSON.parse(options!.body as string));
}
