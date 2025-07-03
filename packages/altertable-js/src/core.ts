import {
  AUTO_CAPTURE_INTERVAL_MS,
  DEFAULT_BASE_URL,
  DEFAULT_ENVIRONMENT,
  DEFAULT_PERSISTENCE,
  EVENT_PAGEVIEW,
  PROPERTY_LIB,
  PROPERTY_LIB_VERSION,
  PROPERTY_REFERER,
  PROPERTY_RELEASE,
  PROPERTY_URL,
  PROPERTY_VIEWPORT,
  STORAGE_KEY,
} from './constants';
import { getViewport } from './lib/getViewport';
import { invariant } from './lib/invariant';
import { createLogger } from './lib/logger';
import { safelyRunOnBrowser } from './lib/safelyRunOnBrowser';
import { SessionManager } from './lib/sessionManager';
import {
  selectStorage,
  type StorageApi,
  type StorageType,
} from './lib/storage';
import { validateUserId } from './lib/validateUserId';
import { EventPayload, EventProperties, UserTraits } from './types';

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
  private _sessionManager: SessionManager | undefined;
  private _storage: StorageApi | undefined;

  constructor() {
    this._lastUrl = null;
    this._referrer = null;
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

    this._sessionManager = new SessionManager({
      storage: this._storage,
      logger: this._logger,
    });
    this._sessionManager.init();

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
    invariant(
      this._isInitialized,
      'The client must be initialized with init() before configuring.'
    );

    if (
      updates.autoCapture !== undefined &&
      updates.autoCapture !== this._config.autoCapture
    ) {
      this._handleAutoCaptureChange(updates.autoCapture);
    }

    if (
      updates.persistence !== undefined &&
      updates.persistence !== this._config.persistence
    ) {
      const previousStorage = this._storage;
      this._storage = selectStorage(updates.persistence, {
        onFallback: message => this._logger.warn(message),
      });
      this._storage.migrate(previousStorage, [STORAGE_KEY]);
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
      const intervalId = setInterval(checkForChanges, AUTO_CAPTURE_INTERVAL_MS);

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

  identify(userId: string, traits: UserTraits) {
    invariant(
      this._isInitialized,
      'The client must be initialized with init() before identifying users.'
    );

    try {
      validateUserId(userId);
    } catch (error) {
      throw new Error(`[Altertable] ${error.message}`);
    }

    this._sessionManager.setUserId(userId);
    this._request('/identify', {
      environment: this._config.environment || DEFAULT_ENVIRONMENT,
      traits,
      user_id: userId,
      visitor_id: this._sessionManager.getVisitorId(),
    });
  }

  updateTraits(traits: UserTraits) {
    const userId = this._sessionManager.getUserId();
    invariant(
      userId,
      'User must be identified with identify() before updating traits.'
    );

    this._request('/identify', {
      environment: this._config.environment || DEFAULT_ENVIRONMENT,
      traits,
      user_id: userId,
      visitor_id: this._sessionManager.getVisitorId(),
    });
  }

  reset({
    resetVisitorId = false,
    resetSessionId = true,
  }: {
    resetVisitorId?: boolean;
    resetSessionId?: boolean;
  } = {}) {
    invariant(
      this._isInitialized,
      'The client must be initialized with init() before resetting.'
    );

    this._sessionManager.reset({ resetVisitorId, resetSessionId });
  }

  page(url: string) {
    invariant(
      this._isInitialized,
      'The client must be initialized with init() before tracking page views.'
    );

    const parsedUrl = new URL(url);
    const urlWithoutSearch = `${parsedUrl.origin}${parsedUrl.pathname}`;
    this.track(EVENT_PAGEVIEW, {
      [PROPERTY_URL]: urlWithoutSearch,
      [PROPERTY_VIEWPORT]: getViewport(),
      [PROPERTY_REFERER]: this._referrer,
      ...Object.fromEntries(parsedUrl.searchParams),
    });
  }

  track(event: string, properties: EventProperties = {}) {
    invariant(
      this._isInitialized,
      'The client must be initialized with init() before tracking events.'
    );

    this._sessionManager.renewSessionIfNeeded();
    const timestamp = new Date().toISOString();
    this._sessionManager.updateLastEventAt(timestamp);

    const payload: EventPayload = {
      timestamp,
      event,
      environment: this._config.environment || DEFAULT_ENVIRONMENT,
      user_id: this._sessionManager.getUserId(),
      session_id: this._sessionManager.getSessionId(),
      visitor_id: this._sessionManager.getVisitorId(),
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
}
