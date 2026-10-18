import { STORAGE_KEY_TEST } from '../constants';
import { safelyRunOnBrowser } from './safelyRunOnBrowser';

export type StorageType =
  | 'localStorage'
  | 'sessionStorage'
  | 'cookie'
  | 'memory'
  | 'localStorage+cookie';

/** Synchronous storage contract. Async backends must be hydrated before init. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  /** Deletion failures are reported through the client onError handler without interrupting privacy controls. */
  removeItem(key: string): void;
}

export type Persistence = StorageType | StorageAdapter;

export interface StorageApi extends StorageAdapter {
  migrate(fromStorage: StorageApi, keys: string[]): void;
}

function migrateKeys(
  toStorage: StorageApi,
  fromStorage: StorageApi,
  keys: string[]
): void {
  for (const key of keys) {
    const value = fromStorage.getItem(key);
    if (value !== null && toStorage.setItem(key, value)) {
      fromStorage.removeItem(key);
    }
  }
}

class MemoryStore implements StorageApi {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): boolean {
    this.store[key] = value;
    return true;
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
  setItem(key: string, value: string): boolean {
    return safelyRunOnBrowser(
      ({ window }) => {
        window.document.cookie = `${key}=${encodeURIComponent(value)}; path=/;`;
        return true;
      },
      () => false
    );
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
  setItem(key: string, value: string): boolean {
    return safelyRunOnBrowser(
      ({ window }) => {
        try {
          window[this.storage].setItem(key, value);
          return true;
        } catch {
          return false;
        }
      },
      () => false
    );
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
  setItem(key: string, value: string): boolean {
    const didSetLocal = this.localStore.setItem(key, value);
    const didSetCookie = this.cookieStore.setItem(key, value);
    return didSetLocal || didSetCookie;
  }
  removeItem(key: string) {
    this.localStore.removeItem(key);
    this.cookieStore.removeItem(key);
  }
  migrate(fromStorage: StorageApi, keys: string[]) {
    migrateKeys(this, fromStorage, keys);
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
  type: Persistence | 'unknown',
  params: {
    onFallback: (message: string) => void;
    onError?: (error: Error) => void;
  }
): StorageApi {
  const { onFallback } = params;

  if (typeof type === 'object' && type !== null) {
    return {
      getItem: key => type.getItem(key),
      setItem: (key, value) => type.setItem(key, value),
      removeItem(key) {
        try {
          type.removeItem(key);
        } catch (error) {
          const sourceError =
            error instanceof Error ? error : new Error(String(error));
          onFallback(`Failed to remove persisted data: ${sourceError.message}`);
          params.onError?.(sourceError);
        }
      },
      migrate(fromStorage, keys) {
        migrateKeys(this, fromStorage, keys);
      },
    };
  }

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

export function selectEventStorage(
  type: Persistence | 'unknown',
  params: {
    onFallback: (message: string) => void;
    onError?: (error: Error) => void;
  }
): StorageApi {
  const { onFallback } = params;

  if (typeof type === 'object' && type !== null) {
    return selectStorage(type, params);
  }

  switch (type) {
    case 'localStorage':
    case 'localStorage+cookie': {
      if (testStorageSupport('localStorage')) {
        return new WebStorageStore('localStorage');
      }
      onFallback(
        'localStorage not supported for event buffering, falling back to memory.'
      );
      return new MemoryStore();
    }

    case 'sessionStorage': {
      if (testStorageSupport('sessionStorage')) {
        return new WebStorageStore('sessionStorage');
      }
      onFallback(
        'sessionStorage not supported for event buffering, falling back to memory.'
      );
      return new MemoryStore();
    }

    case 'cookie':
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
