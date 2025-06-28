import { Logger } from './logger';
import { safelyRunOnBrowser } from './safelyRunOnBrowser';

export type StorageType =
  | 'localStorage'
  | 'sessionStorage'
  | 'cookie'
  | 'memory'
  | 'localStorage+cookie';

export interface StorageAPI {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class MemoryStore implements StorageAPI {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
}

class CookieStore implements StorageAPI {
  getItem(key: string): string | null {
    return safelyRunOnBrowser(
      ({ window }): string | null => {
        const match = window.document.cookie.match(
          new RegExp('(^| )' + key + '=([^;]+)')
        );
        return match ? decodeURIComponent(match[2]) : null;
      },
      (): string | null => null
    );
  }
  setItem(key: string, value: string): void {
    safelyRunOnBrowser(
      ({ window }): void => {
        window.document.cookie = `${key}=${encodeURIComponent(value)}; path=/;`;
      },
      (): void => undefined
    );
  }
  removeItem(key: string): void {
    safelyRunOnBrowser(
      ({ window }): void => {
        window.document.cookie = `${key}=; Max-Age=0; path=/;`;
      },
      (): void => undefined
    );
  }
}

class LocalStorageStore implements StorageAPI {
  getItem(key: string): string | null {
    return safelyRunOnBrowser(
      ({ window }): string | null => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      (): string | null => null
    );
  }
  setItem(key: string, value: string): void {
    safelyRunOnBrowser(
      ({ window }): void => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* ignore */
        }
      },
      (): void => undefined
    );
  }
  removeItem(key: string): void {
    safelyRunOnBrowser(
      ({ window }): void => {
        try {
          window.localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      },
      (): void => undefined
    );
  }
}

class SessionStorageStore implements StorageAPI {
  getItem(key: string): string | null {
    return safelyRunOnBrowser(
      ({ window }): string | null => {
        try {
          return window.sessionStorage.getItem(key);
        } catch {
          return null;
        }
      },
      (): string | null => null
    );
  }
  setItem(key: string, value: string): void {
    safelyRunOnBrowser(
      ({ window }): void => {
        try {
          window.sessionStorage.setItem(key, value);
        } catch {
          /* ignore */
        }
      },
      (): void => undefined
    );
  }
  removeItem(key: string): void {
    safelyRunOnBrowser(
      ({ window }): void => {
        try {
          window.sessionStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      },
      (): void => undefined
    );
  }
}

class LocalPlusCookieStore implements StorageAPI {
  private local: LocalStorageStore;
  private cookie: CookieStore;
  constructor() {
    this.local = new LocalStorageStore();
    this.cookie = new CookieStore();
  }
  getItem(key: string): string | null {
    return this.local.getItem(key) ?? this.cookie.getItem(key);
  }
  setItem(key: string, value: string): void {
    this.local.setItem(key, value);
    this.cookie.setItem(key, value);
  }
  removeItem(key: string): void {
    this.local.removeItem(key);
    this.cookie.removeItem(key);
  }
}

function isLocalStorageSupported(): boolean {
  return safelyRunOnBrowser(
    ({ window }): boolean => {
      try {
        const key = '__test__';
        window.localStorage.setItem(key, '1');
        window.localStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
    (): boolean => false
  );
}

function isSessionStorageSupported(): boolean {
  return safelyRunOnBrowser(
    ({ window }): boolean => {
      try {
        const key = '__test__';
        window.sessionStorage.setItem(key, '1');
        window.sessionStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
    (): boolean => false
  );
}

function isCookieSupported(): boolean {
  return safelyRunOnBrowser(
    ({ window }): boolean => {
      try {
        window.document.cookie = 'cookietest=1';
        const supported = window.document.cookie.indexOf('cookietest=') !== -1;
        window.document.cookie = 'cookietest=; Max-Age=0';
        return supported;
      } catch {
        return false;
      }
    },
    (): boolean => false
  );
}

export function selectStorage(
  type: StorageType | 'unknown',
  dependencies: { logger: Logger }
): StorageAPI {
  const { logger } = dependencies;

  switch (type) {
    case 'localStorage': {
      if (isLocalStorageSupported()) {
        return new LocalStorageStore();
      } else {
        logger.error(
          'localStorage not supported, falling back to localStorage+cookie'
        );
        return selectStorage('localStorage+cookie', dependencies);
      }
    }
    case 'localStorage+cookie': {
      if (isLocalStorageSupported() && isCookieSupported()) {
        return new LocalPlusCookieStore();
      } else if (isCookieSupported()) {
        logger.error(
          'localStorage+cookie not fully supported, falling back to cookie'
        );
        return new CookieStore();
      } else if (isLocalStorageSupported()) {
        logger.error('Cookie not supported, falling back to localStorage');
        return new LocalStorageStore();
      } else {
        logger.error(
          'Neither localStorage nor cookie supported, falling back to memory'
        );
        return new MemoryStore();
      }
    }
    case 'sessionStorage': {
      if (isSessionStorageSupported()) {
        return new SessionStorageStore();
      } else {
        logger.error('sessionStorage not supported, falling back to memory');
        return new MemoryStore();
      }
    }
    case 'cookie': {
      if (isCookieSupported()) {
        return new CookieStore();
      } else {
        logger.error('cookie not supported, falling back to memory');
        return new MemoryStore();
      }
    }
    case 'memory': {
      return new MemoryStore();
    }
    default: {
      logger.error('Unknown storage type, falling back to localStorage+cookie');
      return selectStorage('localStorage+cookie', dependencies);
    }
  }
}
