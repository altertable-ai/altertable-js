import { Mock, vi } from 'vitest';

import { StorageApi } from '../../packages/altertable-js/src/lib/storage';

export type StorageMock = {
  getItem: Mock<(key: string) => string | null>;
  setItem: Mock<(key: string, value: string) => void>;
  removeItem: Mock<(key: string) => void>;
  migrate: Mock<(fromStorage: StorageApi, keys: string[]) => void>;
};

export function createStorageMock(
  overrides: Partial<StorageMock> = {}
): StorageMock {
  return {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    migrate: vi.fn(),
    ...overrides,
  };
}
