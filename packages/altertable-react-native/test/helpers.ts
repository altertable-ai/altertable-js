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
