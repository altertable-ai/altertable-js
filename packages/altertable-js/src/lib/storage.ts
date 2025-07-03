import { STORAGE_KEY_TEST } from '../constants';
import { safelyRunOnBrowser } from './safelyRunOnBrowser';

export type StorageType =
  | 'localStorage'
  | 'sessionStorage'
  | 'cookie'
  | 'memory'
  | 'localStorage+cookie';

export interface StorageApi {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  migrate(fromStorage: StorageApi, keys: string[]): void;
}

function migrateKeys(
  toStorage: StorageApi,
  fromStorage: StorageApi,
  keys: string[]
): void {
  for (const key of keys) {
    const value = fromStorage.getItem(key);
    if (value !== null) {
      toStorage.setItem(key, value);
      fromStorage.removeItem(key);
    }
  }
}

class MemoryStore implements StorageApi {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string) {
    this.store[key] = value;
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  migrate(fromStorage: StorageApi, keys: string[]) {
    migrateKeys(this, fromStorage, keys);
  }
}

class CookieStore implements StorageApi {
  getItem(key: string): string | null {
    return safelyRunOnBrowser<string | null>(
      ({ window }) => {
        const match = window.document.cookie.match(
          new RegExp('(^| )' + key + '=([^;]+)')
        );
        return match ? decodeURIComponent(match[2]) : null;
      },
      () => null
    );
  }
  setItem(key: string, value: string) {
    safelyRunOnBrowser(({ window }) => {
      window.document.cookie = `${key}=${encodeURIComponent(value)}; path=/;`;
    });
  }
  removeItem(key: string) {
    safelyRunOnBrowser(({ window }) => {
      window.document.cookie = `${key}=; Max-Age=0; path=/;`;
    });
  }
  migrate(fromStorage: StorageApi, keys: string[]) {
    migrateKeys(this, fromStorage, keys);
  }
}

class WebStorageStore implements StorageApi {
  constructor(private storage: 'localStorage' | 'sessionStorage') {}
  getItem(key: string): string | null {
    return safelyRunOnBrowser<string | null>(
      ({ window }) => {
        try {
          return window[this.storage].getItem(key);
        } catch {
          return null;
        }
      },
      () => null
    );
  }
  setItem(key: string, value: string) {
    safelyRunOnBrowser(({ window }) => {
      try {
        window[this.storage].setItem(key, value);
      } catch {
        /* ignore */
      }
    });
  }
  removeItem(key: string) {
    safelyRunOnBrowser(({ window }) => {
      try {
        window[this.storage].removeItem(key);
      } catch {
        /* ignore */
      }
    });
  }
  migrate(fromStorage: StorageApi, keys: string[]) {
    migrateKeys(this, fromStorage, keys);
  }
}

class LocalPlusCookieStore implements StorageApi {
  private localStore = new WebStorageStore('localStorage');
  private cookieStore = new CookieStore();
  getItem(key: string): string | null {
    return this.localStore.getItem(key) ?? this.cookieStore.getItem(key);
  }
  setItem(key: string, value: string) {
    this.localStore.setItem(key, value);
    this.cookieStore.setItem(key, value);
  }
  removeItem(key: string) {
    this.localStore.removeItem(key);
    this.cookieStore.removeItem(key);
  }
  migrate(fromStorage: StorageApi, keys: string[]) {
    // Migrate to both localStorage and cookie without removing from source yet
    for (const key of keys) {
      const value = fromStorage.getItem(key);
      if (value !== null) {
        this.localStore.setItem(key, value);
        this.cookieStore.setItem(key, value);
      }
    }

    for (const key of keys) {
      fromStorage.removeItem(key);
    }
  }
}

function testStorageSupport(
  storageType: 'localStorage' | 'sessionStorage' | 'cookie'
) {
  return safelyRunOnBrowser(
    ({ window }) => {
      try {
        if (storageType === 'cookie') {
          window.document.cookie = `${STORAGE_KEY_TEST}=1`;
          const supported =
            window.document.cookie.indexOf(`${STORAGE_KEY_TEST}=`) !== -1;
          window.document.cookie = `${STORAGE_KEY_TEST}=; Max-Age=0`;
          return supported;
        } else {
          window[storageType].setItem(STORAGE_KEY_TEST, '1');
          window[storageType].removeItem(STORAGE_KEY_TEST);
          return true;
        }
      } catch {
        return false;
      }
    },
    () => false
  );
}

export function selectStorage(
  type: StorageType | 'unknown',
  params: { onFallback: (message: string) => void }
): StorageApi {
  const { onFallback } = params;

  switch (type) {
    case 'localStorage': {
      if (testStorageSupport('localStorage')) {
        return new WebStorageStore('localStorage');
      }
      onFallback(
        'localStorage not supported, falling back to localStorage+cookie.'
      );
      return selectStorage('localStorage+cookie', params);
    }

    case 'localStorage+cookie': {
      const localStorageSupported = testStorageSupport('localStorage');
      const cookieSupported = testStorageSupport('cookie');

      if (localStorageSupported && cookieSupported) {
        return new LocalPlusCookieStore();
      } else if (cookieSupported) {
        onFallback(
          'localStorage+cookie not fully supported, falling back to cookie.'
        );
        return new CookieStore();
      } else if (localStorageSupported) {
        onFallback('cookie not supported, falling back to localStorage.');
        return new WebStorageStore('localStorage');
      } else {
        onFallback(
          'Neither localStorage nor cookie supported, falling back to memory.'
        );
        return new MemoryStore();
      }
    }

    case 'sessionStorage': {
      if (testStorageSupport('sessionStorage')) {
        return new WebStorageStore('sessionStorage');
      }
      onFallback('sessionStorage not supported, falling back to memory.');
      return new MemoryStore();
    }

    case 'cookie': {
      if (testStorageSupport('cookie')) {
        return new CookieStore();
      }
      onFallback('cookie not supported, falling back to memory.');
      return new MemoryStore();
    }

    case 'memory': {
      return new MemoryStore();
    }

    default: {
      throw new Error(
        `Unknown storage type: "${type}". Valid types are: localStorage, sessionStorage, cookie, memory, localStorage+cookie.`
      );
    }
  }
}
