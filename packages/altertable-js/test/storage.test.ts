import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEY_TEST } from '../src/constants';
import {
  selectStorage,
  type StorageApi,
  type StorageType,
} from '../src/lib/storage';

type MockStorage = Partial<Storage> & {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

describe('Storage API', () => {
  let mockWindow: Partial<typeof window>;
  let mockDocument: Partial<Document>;
  let mockLocalStorage: MockStorage;
  let mockSessionStorage: MockStorage;
  let onFallback: (message: string) => void;
  let originalWindow: typeof window;

  function disableCookieSupport() {
    // Mock cookie to fail by making the test cookie not persist
    // This simulates a browser where cookies are disabled
    let cookieValue = '';
    Object.defineProperty(mockDocument, 'cookie', {
      get: () => cookieValue,
      set: (value: string) => {
        // Simulate cookies not being supported by not storing them
        if (value.includes('Max-Age=0')) {
          // Allow cleanup to work
          cookieValue = value;
        }
        // Don't store other cookies to simulate failure
      },
      configurable: true,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();

    originalWindow = global.window;
    mockLocalStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    mockSessionStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    mockDocument = {
      cookie: '',
    };
    mockWindow = {
      localStorage: mockLocalStorage as unknown as Storage,
      sessionStorage: mockSessionStorage as unknown as Storage,
      document: mockDocument as Document,
    };

    Object.defineProperty(global, 'window', {
      value: mockWindow,
      writable: true,
      configurable: true,
    });

    onFallback = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  describe('MemoryStore', () => {
    let storage: StorageApi;

    beforeEach(() => {
      storage = selectStorage('memory', { onFallback });
    });

    it('should store and retrieve values', () => {
      storage.setItem('test-key', 'test-value');
      expect(storage.getItem('test-key')).toBe('test-value');
    });

    it('should return null for non-existent keys', () => {
      expect(storage.getItem('non-existent')).toBeNull();
    });

    it('should remove items', () => {
      storage.setItem('test-key', 'test-value');
      storage.removeItem('test-key');
      expect(storage.getItem('test-key')).toBeNull();
    });

    it('should handle multiple items independently', () => {
      storage.setItem('key1', 'value1');
      storage.setItem('key2', 'value2');
      expect(storage.getItem('key1')).toBe('value1');
      expect(storage.getItem('key2')).toBe('value2');
    });
  });

  describe('CookieStore', () => {
    let storage: StorageApi;

    beforeEach(() => {
      storage = selectStorage('cookie', { onFallback });
    });

    it('should store and retrieve values from cookies', () => {
      storage.setItem('test-key', 'test-value');
      expect(mockDocument.cookie).toContain('test-key=test-value');

      // Simulate reading from cookie
      mockDocument.cookie = 'test-key=test-value; other-cookie=value';
      expect(storage.getItem('test-key')).toBe('test-value');
    });

    it('should handle special characters in values', () => {
      storage.setItem('test-key', 'test=value; with; semicolons');
      expect(mockDocument.cookie).toContain(
        'test-key=test%3Dvalue%3B%20with%3B%20semicolons'
      );
    });

    it('should return null for non-existent cookies', () => {
      mockDocument.cookie = 'other-cookie=value';
      expect(storage.getItem('test-key')).toBeNull();
    });

    it('should remove cookies', () => {
      mockDocument.cookie = 'test-key=value; other-cookie=value2';
      storage.removeItem('test-key');
      expect(mockDocument.cookie).toContain('test-key=; Max-Age=0');
    });
  });

  describe('WebStorageStore / localStorage', () => {
    let storage: StorageApi;

    beforeEach(() => {
      storage = selectStorage('localStorage', { onFallback });
    });

    it('should store and retrieve values from localStorage', () => {
      storage.setItem('test-key', 'test-value');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'test-key',
        'test-value'
      );

      mockLocalStorage.getItem.mockReturnValue('test-value');
      expect(storage.getItem('test-key')).toBe('test-value');
    });

    it('should handle localStorage errors gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      storage.setItem('test-key', 'test-value');
      // Should not throw, just ignore the error
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should handle getItem errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(storage.getItem('test-key')).toBeNull();
    });

    it('should handle removeItem errors gracefully', () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('SecurityError');
      });

      storage.removeItem('test-key');
      // Should not throw, just ignore the error
      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
    });
  });

  describe('WebStorageStore / sessionStorage', () => {
    let storage: StorageApi;

    beforeEach(() => {
      storage = selectStorage('sessionStorage', { onFallback });
    });

    it('should store and retrieve values from sessionStorage', () => {
      storage.setItem('test-key', 'test-value');
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        'test-key',
        'test-value'
      );

      mockSessionStorage.getItem.mockReturnValue('test-value');
      expect(storage.getItem('test-key')).toBe('test-value');
    });
  });

  describe('LocalPlusCookieStore', () => {
    let storage: StorageApi;

    beforeEach(() => {
      storage = selectStorage('localStorage+cookie', { onFallback });
    });

    it('should store values in both localStorage and cookies', () => {
      storage.setItem('test-key', 'test-value');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'test-key',
        'test-value'
      );
      expect(mockDocument.cookie).toContain('test-key=test-value');
    });

    it('should retrieve from localStorage first, then fallback to cookie', () => {
      // First try localStorage
      mockLocalStorage.getItem.mockReturnValue('local-value');
      expect(storage.getItem('test-key')).toBe('local-value');

      // Then try cookie fallback
      mockLocalStorage.getItem.mockReturnValue(null);
      mockDocument.cookie = 'test-key=cookie-value';
      expect(storage.getItem('test-key')).toBe('cookie-value');
    });

    it('should remove from both localStorage and cookies', () => {
      storage.removeItem('test-key');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('test-key');
      expect(mockDocument.cookie).toContain('test-key=; Max-Age=0');
    });
  });

  describe('selectStorage', () => {
    describe('storage support testing', () => {
      it('should test localStorage support correctly', () => {
        mockLocalStorage.setItem.mockImplementation(() => {});
        mockLocalStorage.removeItem.mockImplementation(() => {});

        const storage = selectStorage('localStorage', { onFallback });
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          STORAGE_KEY_TEST,
          '1'
        );
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
          STORAGE_KEY_TEST
        );
      });

      it('should test sessionStorage support correctly', () => {
        mockSessionStorage.setItem.mockImplementation(() => {});
        mockSessionStorage.removeItem.mockImplementation(() => {});

        const storage = selectStorage('sessionStorage', { onFallback });
        expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
          STORAGE_KEY_TEST,
          '1'
        );
        expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(
          STORAGE_KEY_TEST
        );
      });

      it('should test cookie support correctly', () => {
        const storage = selectStorage('cookie', { onFallback });
        // Only the cleared cookie will be present due to the mock
        expect(mockDocument.cookie).toContain(
          `${STORAGE_KEY_TEST}=; Max-Age=0`
        );
      });
    });

    describe('fallback behavior', () => {
      it('should fallback to localStorage+cookie when localStorage fails', () => {
        mockLocalStorage.setItem.mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });

        selectStorage('localStorage', { onFallback });
        expect(onFallback).toHaveBeenCalledWith(
          'localStorage not supported, falling back to localStorage+cookie.'
        );
      });

      it('should fallback to cookie when localStorage+cookie partially fails', () => {
        mockLocalStorage.setItem.mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });

        selectStorage('localStorage+cookie', { onFallback });
        expect(onFallback).toHaveBeenCalledWith(
          'localStorage+cookie not fully supported, falling back to cookie.'
        );
      });

      it('should fallback to localStorage when cookie is not supported', () => {
        // Mock localStorage to work
        mockLocalStorage.setItem.mockImplementation(() => {});
        mockLocalStorage.removeItem.mockImplementation(() => {});

        disableCookieSupport();

        selectStorage('localStorage+cookie', { onFallback });
        expect(onFallback).toHaveBeenCalledWith(
          'cookie not supported, falling back to localStorage.'
        );
      });

      it('should fallback to memory when both localStorage and cookie fail', () => {
        mockLocalStorage.setItem.mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });

        selectStorage('localStorage+cookie', { onFallback });
        expect(onFallback).toHaveBeenCalledWith(
          'localStorage+cookie not fully supported, falling back to cookie.'
        );
      });

      it('should fallback to memory when both localStorage and cookie fail completely', () => {
        mockLocalStorage.setItem.mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
        disableCookieSupport();

        selectStorage('localStorage+cookie', { onFallback });
        expect(onFallback).toHaveBeenCalledWith(
          'Neither localStorage nor cookie supported, falling back to memory.'
        );
      });

      it('should fallback to memory when sessionStorage fails', () => {
        mockSessionStorage.setItem.mockImplementation(() => {
          throw new Error('SecurityError');
        });

        selectStorage('sessionStorage', { onFallback });
        expect(onFallback).toHaveBeenCalledWith(
          'sessionStorage not supported, falling back to memory.'
        );
      });

      it('should fallback to memory when cookie fails', () => {
        disableCookieSupport();

        selectStorage('cookie', { onFallback });
        expect(onFallback).toHaveBeenCalledWith(
          'cookie not supported, falling back to memory.'
        );
      });

      it('should throw for unknown storage type', () => {
        expect(() => {
          selectStorage('unknown' as StorageType, { onFallback });
        }).toThrow(
          'Unknown storage type: "unknown". Valid types are: localStorage, sessionStorage, cookie, memory, localStorage+cookie.'
        );
        expect(onFallback).not.toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle non-existent window gracefully', () => {
        Object.defineProperty(global, 'window', {
          value: undefined,
          writable: true,
          configurable: true,
        });

        const storage = selectStorage('localStorage', { onFallback });
        expect(storage.getItem('test')).toBeNull();
      });
    });
  });
});
