import {
  AUTO_CAPTURE_INTERVAL,
  DEFAULT_BASE_URL,
  DEFAULT_ENVIRONMENT,
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
  STORAGE_KEY_TRACKING_CONSENT,
  STORAGE_KEY_VISITOR_ID,
  TrackingConsent,
  type TrackingConsentType,
} from './lib/constants';
import { EventQueue } from './lib/eventQueue';
import { invariant } from './lib/invariant';
import { createLogger, type Logger } from './lib/logger';
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
   * The persistence strategy for storing IDs.
   * @default "localStorage+cookie"
   */
  persistence?: StorageType;
  /**
   * Whether to log events to the console.
   * @default false
   */
  debug?: boolean;
  /**
   * The tracking consent state.
   * @default "pending"
   */
  trackingConsent?: TrackingConsentType;
}

export class Altertable {
  private _lastUrl: string;
  private _apiKey: string | undefined;
  private _config: AltertableConfig | undefined;
  private _sessionId: string;
  private _visitorId: string;
  private _userId: string;
  private _referrer: string | null;
  private _logger: Logger = createLogger('Altertable');
  private _storage: StorageApi | undefined;
  private _cleanupAutoCapture: (() => void) | undefined;
  private _eventQueue: EventQueue;
  private _trackingConsent: TrackingConsentType;

  constructor() {
    this._referrer = safelyRunOnBrowser<string | null>(
      ({ window }) => window.document.referrer || null,
      () => null
    );
    this._lastUrl = safelyRunOnBrowser(
      ({ window }) => window.location.href,
      () => ''
    );
    this._sessionId = this._generateId('session');
    this._visitorId = this._generateId('visitor');
    this._userId = this._generateId('anonymous');
    this._eventQueue = new EventQueue();
    this._trackingConsent = TrackingConsent.PENDING;
  }

  init(apiKey: string, config: AltertableConfig = {}) {
    this._apiKey = apiKey;
    this._config = config;
    const persistence: StorageType =
      config.persistence ?? 'localStorage+cookie';
    this._storage = selectStorage(persistence, {
      onError: message => this._logger.error(message),
    });

    this._initializeTrackingConsent(config.trackingConsent);
    this._handleAutoCaptureChange(config.autoCapture ?? true);

    return () => {
      this._cleanupAutoCapture?.();
    };
  }

    if (!this._isInitialized()) {
  configure(updates: Partial<AltertableConfig>) {
      this._logger.warnDev(
        'The client must be initialized with init() before configuring.'
      );
      return;
    }

    if (
      updates.persistence !== undefined &&
      updates.persistence !== this._config.persistence
    ) {
      this._storage = selectStorage(updates.persistence, {
        onError: message => this._logger.error(message),
      });
    }

    if (
      updates.autoCapture !== undefined &&
      updates.autoCapture !== this._config.autoCapture
    ) {
      this._handleAutoCaptureChange(updates.autoCapture);
    }

    if (
      updates.trackingConsent !== undefined &&
      updates.trackingConsent !== this._trackingConsent
    ) {
      this._handleTrackingConsentChange(updates.trackingConsent);
    }

    this._config = { ...this._config, ...updates };
  }

  private _handleAutoCaptureChange(enableAutoCapture: boolean) {
    if (this._cleanupAutoCapture) {
      this._cleanupAutoCapture();
    }

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

  getTrackingConsent(): TrackingConsentType {
    return this._trackingConsent;
  }

  page(url: string) {
    if (!this._isInitialized()) {
      this._logger.warnDev(
        'The client must be initialized with init() before tracking page views.'
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
    if (!this._isInitialized()) {
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

    switch (this._trackingConsent) {
      case TrackingConsent.GRANTED:
        this._sendEvent(payload);
        break;
      case TrackingConsent.PENDING:
        this._eventQueue.enqueue(payload);
        break;
      case TrackingConsent.DENIED:
        // Do nothing - don't collect or send data
        break;
    }

    if (this._config.debug) {
      this._logger.logEvent(payload);
    }
  }

  private _isInitialized(): boolean {
    return Boolean(this._apiKey && this._config);
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
    invariant(!!this._apiKey, 'Missing API key');
    invariant(!!this._config, 'Missing configuration');

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

  private _initializeTrackingConsent(trackingConsent?: TrackingConsentType) {
    invariant(!!this._storage, 'Storage is not initialized');

    const storedConsent = this._storage.getItem(
      STORAGE_KEY_TRACKING_CONSENT
    ) as TrackingConsentType;

    if (trackingConsent !== undefined) {
      // Tracking consent is provided by the user so we override the stored consent
      this._trackingConsent = trackingConsent;
      this._storage.setItem(STORAGE_KEY_TRACKING_CONSENT, trackingConsent);
    } else if (
      storedConsent &&
      Object.values(TrackingConsent).includes(storedConsent)
    ) {
      this._trackingConsent = storedConsent;
    } else {
      this._trackingConsent = TrackingConsent.PENDING;
      this._storage.setItem(
        STORAGE_KEY_TRACKING_CONSENT,
        TrackingConsent.PENDING
      );
    }
  }

  private _handleTrackingConsentChange(trackingConsent: TrackingConsentType) {
    invariant(!!this._storage, 'Storage is not initialized');

    const previousConsent = this._trackingConsent;
    this._trackingConsent = trackingConsent;
    this._storage.setItem(STORAGE_KEY_TRACKING_CONSENT, trackingConsent);

    if (
      previousConsent === TrackingConsent.PENDING &&
      trackingConsent === TrackingConsent.GRANTED
    ) {
      const queuedEvents = this._eventQueue.flush();
      if (queuedEvents.length > 0) {
        this._logger.log(`Flushing ${queuedEvents.length} queued events`);
        queuedEvents.forEach(event => this._sendEvent(event));
      }
    } else if (trackingConsent === TrackingConsent.DENIED) {
      const queueSize = this._eventQueue.getSize();
      if (queueSize > 0) {
        this._eventQueue.clear();
        this._logger.log(
          `Cleared ${queueSize} queued events due to denied consent`
        );
      }
    }
  }

  private _sendEvent(event: EventPayload): void {
    this._request('/track', event);
  }
}
