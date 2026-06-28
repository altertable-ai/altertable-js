import { Mock, vi } from 'vitest';

import { StorageApi } from '../../packages/altertable-js/src/lib/storage';

type StorageMethodMock<TKey extends keyof StorageApi> = Mock<StorageApi[TKey]>;

export type StorageMock = {
  getItem: StorageMethodMock<'getItem'>;
  setItem: StorageMethodMock<'setItem'>;
  removeItem: StorageMethodMock<'removeItem'>;
  migrate: StorageMethodMock<'migrate'>;
};

export function createStorageMock(
  overrides: Partial<StorageMock> = {}
): StorageMock {
  return {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn().mockReturnValue(true),
    removeItem: vi.fn(),
    migrate: vi.fn(),
    ...overrides,
  };
}
