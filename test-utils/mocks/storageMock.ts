import { Mock, vi } from 'vitest';

import { StorageApi } from '../../packages/altertable-js/src/lib/storage';

export function createStorageMock(
  overrides: Partial<{
    [key in keyof StorageApi]: Mock<
      (...args: Parameters<StorageApi[key]>) => ReturnType<StorageApi[key]>
    >;
  }> = {}
) {
  return {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    migrate: vi.fn(),
    ...overrides,
  };
}

export type StorageMock = ReturnType<typeof createStorageMock>;
