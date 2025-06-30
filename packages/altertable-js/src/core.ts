import { invariant } from './lib/invariant';
import { createLogger } from './lib/logger';
import { safelyRunOnBrowser } from './lib/safelyRunOnBrowser';
import { EventPayload } from './types';

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
}

const DEFAULT_BASE_URL = 'https://api.altertable.ai';
const DEFAULT_ENVIRONMENT = 'production';

export type EventProperties = Record<string, unknown>;

export const PAGEVIEW_EVENT = '$pageview';

export const SESSION_STORAGE_KEY = 'altertable-session-id';
export const LOCAL_STORAGE_KEY = 'altertable-visitor-id';
export const AUTO_CAPTURE_INTERVAL = 100;

export const PROPERTY_URL = '$url';
export const PROPERTY_SESSION_ID = '$session_id';
export const PROPERTY_VISITOR_ID = '$visitor_id';
export const PROPERTY_VIEWPORT = '$viewport';
export const PROPERTY_REFERER = '$referer';
export const PROPERTY_RELEASE = '$release';
export const PROPERTY_LIB = '$lib';
export const PROPERTY_LIB_VERSION = '$lib_version';

export class Altertable {
  private _apiKey: string;
  private _cleanupAutoCapture: (() => void) | undefined;
  private _config: AltertableConfig;
  private _isInitialized = false;
  private _lastUrl: string | null;
  private _logger = createLogger('Altertable');
  private _referrer: string | null;
  private _sessionId: string;
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
    try {
      /* eslint-disable no-restricted-globals */
      let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!id) {
        id = this._sessionId;
        sessionStorage.setItem(SESSION_STORAGE_KEY, id);
      }
      return id;
      /* eslint-enable no-restricted-globals */
    } catch {
      return this._sessionId;
    }
  }

  private _getVisitorId(): string {
    try {
      /* eslint-disable no-restricted-globals */
      let id = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!id) {
        id = this._visitorId;
        localStorage.setItem(LOCAL_STORAGE_KEY, id);
      }
      return id;
      /* eslint-enable no-restricted-globals */
    } catch {
      return this._visitorId;
    }
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
