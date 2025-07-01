import {
  AUTO_CAPTURE_INTERVAL,
  DEFAULT_BASE_URL,
  DEFAULT_ENVIRONMENT,
  DEFAULT_PERSISTENCE,
  PAGEVIEW_EVENT,
  PROPERTY_LIB,
  PROPERTY_LIB_VERSION,
  PROPERTY_REFERER,
  PROPERTY_RELEASE,
  PROPERTY_SESSION_ID,
  PROPERTY_URL,
  PROPERTY_VIEWPORT,
  PROPERTY_VISITOR_ID,
  STORAGE_KEY_SESSION_ID,
  STORAGE_KEY_VISITOR_ID,
} from './constants';
import { invariant } from './lib/invariant';
import { createLogger } from './lib/logger';
import { safelyRunOnBrowser } from './lib/safelyRunOnBrowser';
import {
  selectStorage,
  type StorageApi,
  type StorageType,
} from './lib/storage';
import { EventPayload, EventProperties } from './types';

export interface AltertableConfig {
  /**
   * The base URL of the Altertable API.
   * @default https://api.altertable.ai
   */
  baseUrl?: string;
  /**
   * The environment of the application.
   * @default "production"
   */
  environment?: string;
  /**
   * Whether to automatically capture page views and events.
   * @default true
   */
  autoCapture?: boolean;
  /**
   * The release ID of the application.
   * This is helpful to identify the version of the application an event is coming from.
   */
  release?: string;
  /**
   * Whether to log events to the console.
   * @default false
   */
  debug?: boolean;
  /**
   * The persistence strategy for storing IDs.
   * @default "localStorage+cookie"
   */
  persistence?: StorageType;
}

export class Altertable {
  private _apiKey: string;
  private _cleanupAutoCapture: (() => void) | undefined;
  private _config: AltertableConfig;
  private _isInitialized = false;
  private _lastUrl: string | null;
  private _logger = createLogger('Altertable');
  private _referrer: string | null;
  private _sessionId: string;
  private _storage: StorageApi | undefined;
  private _userId: string;
  private _visitorId: string;

  constructor() {
    this._referrer = null;
    this._lastUrl = null;
    this._sessionId = this._generateId('session');
    this._visitorId = this._generateId('visitor');
    this._userId = this._generateId('anonymous');
  }

  init(apiKey: string, config: AltertableConfig = {}) {
    this._apiKey = apiKey;
    this._config = config;
    this._referrer = safelyRunOnBrowser<string | null>(
      ({ window }) => window.document.referrer || null,
      () => null
    );
    this._lastUrl = safelyRunOnBrowser<string | null>(
      ({ window }) => window.location.href || null,
      () => null
    );
    const persistence: StorageType = config.persistence ?? DEFAULT_PERSISTENCE;
    this._storage = selectStorage(persistence, {
      onFallback: message => this._logger.warn(message),
    });
    this._isInitialized = true;

    if (this._config.debug) {
      this._logger.logHeader();
    }

    this._handleAutoCaptureChange(config.autoCapture ?? true);

    return () => {
      this._cleanupAutoCapture?.();
    };
  }

  configure(updates: Partial<AltertableConfig>) {
    if (!this._isInitialized) {
      this._logger.warnDev(
        'The client must be initialized with init() before configuring.'
      );
      return;
    }

    if (
      updates.autoCapture !== undefined &&
      updates.autoCapture !== this._config.autoCapture
    ) {
      this._handleAutoCaptureChange(updates.autoCapture);
    }

    this._config = { ...this._config, ...updates };
  }

  private _handleAutoCaptureChange(enableAutoCapture: boolean) {
    this._cleanupAutoCapture?.();

    if (enableAutoCapture) {
      if (this._lastUrl) {
        this.page(this._lastUrl);
      }

      const checkForChanges = this._checkForChanges.bind(this);
      const intervalId = setInterval(checkForChanges, AUTO_CAPTURE_INTERVAL);

      safelyRunOnBrowser(({ window }) => {
        window.addEventListener('popstate', checkForChanges);
        window.addEventListener('hashchange', checkForChanges);
      });

      this._cleanupAutoCapture = () => {
        clearInterval(intervalId);
        safelyRunOnBrowser(({ window }) => {
          window.removeEventListener('popstate', checkForChanges);
          window.removeEventListener('hashchange', checkForChanges);
        });
      };
    } else {
      this._cleanupAutoCapture = undefined;
    }
  }

  identify(userId: string) {
    // FIXME: dummy implementation
    this._userId = userId;
  }

  page(url: string) {
    if (!this._isInitialized) {
      this._logger.warnDev(
        'The client must be initialized with init() before configuring.'
      );
      return;
    }

    const parsedUrl = new URL(url);
    const urlWithoutSearch = `${parsedUrl.origin}${parsedUrl.pathname}`;
    this.track(PAGEVIEW_EVENT, {
      [PROPERTY_URL]: urlWithoutSearch,
      [PROPERTY_SESSION_ID]: this._getSessionId(),
      [PROPERTY_VISITOR_ID]: this._getVisitorId(),
      [PROPERTY_VIEWPORT]: this._getViewport(),
      [PROPERTY_REFERER]: this._referrer,
      ...Object.fromEntries(parsedUrl.searchParams),
    });
  }

  track(event: string, properties: EventProperties = {}) {
    if (!this._isInitialized) {
      this._logger.warnDev(
        'The client must be initialized with init() before tracking events.'
      );
      return;
    }

    const payload: EventPayload = {
      timestamp: new Date().toISOString(),
      event,
      user_id: this._userId,
      environment: this._config.environment || DEFAULT_ENVIRONMENT,
      properties: {
        [PROPERTY_LIB]: __LIB__,
        [PROPERTY_LIB_VERSION]: __LIB_VERSION__,
        [PROPERTY_RELEASE]: this._config.release,
        // The above properties might be overridden by user-provided fields
        // and the React library
        ...properties,
      },
    };

    this._request('/track', payload);

    if (this._config.debug) {
      this._logger.logEvent(payload);
    }
  }

  private _checkForChanges() {
    safelyRunOnBrowser(({ window }) => {
      if (!this._config.autoCapture) {
        return;
      }

      const currentUrl = window.location.href;
      if (currentUrl !== this._lastUrl) {
        this.page(currentUrl);
        this._referrer = this._lastUrl;
        this._lastUrl = currentUrl;
      }
    });
  }

  private _request(path: string, body: unknown): void {
    invariant(this._apiKey, 'Missing API key');
    invariant(this._config, 'Missing configuration');

    const url = `${this._config.baseUrl || DEFAULT_BASE_URL}${path}`;
    const payload = JSON.stringify(body);

    /* eslint-disable no-restricted-globals */
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const beaconUrl = `${url}?apiKey=${encodeURIComponent(this._apiKey)}`;
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(beaconUrl, blob);
    } /* eslint-enable no-restricted-globals */ else {
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this._apiKey}`,
        },
        body: payload,
      });
    }
  }

  private _getSessionId(): string {
    let id = this._storage.getItem(STORAGE_KEY_SESSION_ID);
    if (!id) {
      id = this._sessionId;
      this._storage.setItem(STORAGE_KEY_SESSION_ID, id);
    }
    return id;
  }

  private _getVisitorId(): string {
    let id = this._storage.getItem(STORAGE_KEY_VISITOR_ID);
    if (!id) {
      id = this._visitorId;
      this._storage.setItem(STORAGE_KEY_VISITOR_ID, id);
    }
    return id;
  }

  private _generateId(prefix: string): string {
    if (
      typeof globalThis.crypto !== 'undefined' &&
      typeof globalThis.crypto.randomUUID === 'function'
    ) {
      try {
        return `${prefix}-${crypto.randomUUID()}`;
      } catch {
        // Continue with Math.random() fallback.
      }
    }
    return `${prefix}-${Math.random().toString(36).substring(2)}`;
  }

  private _getViewport(): string {
    return safelyRunOnBrowser(
      ({ window }) => `${window.innerWidth}x${window.innerHeight}`,
      () => '0x0'
    );
  }
}
