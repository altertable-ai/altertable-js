import {
  AUTO_CAPTURE_INTERVAL_MS,
  EVENT_PAGEVIEW,
  keyBuilder,
  MAX_EVENT_QUEUE_SIZE,
  PROPERTY_LIB,
  PROPERTY_LIB_VERSION,
  PROPERTY_REFERER,
  PROPERTY_RELEASE,
  PROPERTY_URL,
  PROPERTY_VIEWPORT,
  TrackingConsent,
  TrackingConsentType,
} from './constants';
import { EventQueue } from './lib/eventQueue';
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
import {
  AltertableContext,
  Environment,
  EventPayload,
  EventProperties,
  EventType,
  IdentifyPayload,
  TrackPayload,
  UserTraits,
} from './types';

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
  environment?: Environment;
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
  /**
   * The tracking consent state.
   * @default "pending"
   */
  trackingConsent?: TrackingConsentType;
}

const DEFAULT_CONFIG: AltertableConfig = {
  autoCapture: true,
  baseUrl: 'https://api.altertable.ai',
  debug: false,
  environment: 'production',
  persistence: 'localStorage+cookie',
  release: undefined,
  trackingConsent: TrackingConsent.PENDING,
};

export class Altertable {
  private _apiKey: string | undefined;
  private _cleanupAutoCapture: (() => void) | undefined;
  private _config: AltertableConfig;
  private _eventQueue: EventQueue<EventPayload>;
  private _isInitialized = false;
  private _lastUrl: string | null;
  private _logger = createLogger('Altertable');
  private _referrer: string | null;
  private _sessionManager: SessionManager | undefined;
  private _storage: StorageApi | undefined;
  private _storageKey: string | undefined;

  constructor() {
    this._lastUrl = null;
    this._referrer = null;
    this._eventQueue = new EventQueue(MAX_EVENT_QUEUE_SIZE);
  }

  init(apiKey: string, config: AltertableConfig = {}) {
    invariant(apiKey, 'Missing API key');
    this._apiKey = apiKey;
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._storageKey = keyBuilder(apiKey, this._config.environment);
    this._referrer = safelyRunOnBrowser<string | null>(
      ({ window }) => window.document.referrer || null,
      () => null
    );
    this._lastUrl = safelyRunOnBrowser<string | null>(
      ({ window }) => window.location.href || null,
      () => null
    );
    this._storage = selectStorage(this._config.persistence, {
      onFallback: message => this._logger.warn(message),
    });
    this._sessionManager = new SessionManager({
      storage: this._storage,
      storageKey: this._storageKey,
      logger: this._logger,
      defaultTrackingConsent: this._config.trackingConsent,
    });
    this._sessionManager.init();

    this._isInitialized = true;

    if (this._config.debug) {
      this._logger.logHeader();
    }

    this._handleAutoCaptureChange(this._config.autoCapture);

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
      this._storage.migrate(previousStorage, [this._storageKey]);
    }

    const currentTrackingConsent = this._sessionManager.getTrackingConsent();
    if (
      updates.trackingConsent !== undefined &&
      updates.trackingConsent !== currentTrackingConsent
    ) {
      this._sessionManager.setTrackingConsent(updates.trackingConsent);

      if (
        currentTrackingConsent !== TrackingConsent.GRANTED &&
        updates.trackingConsent === TrackingConsent.GRANTED
      ) {
        const queuedEvents = this._eventQueue.flush();
        if (queuedEvents.length > 0) {
          queuedEvents.forEach(event => {
            this._processEvent(event.eventType, event.payload, event.context);
          });
        }
      } else if (updates.trackingConsent === TrackingConsent.DENIED) {
        this._eventQueue.clear();
      }
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

  identify(userId: string, traits: UserTraits = {}) {
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
    const context = this._getContext();
    const payload: IdentifyPayload = {
      environment: context.environment,
      traits,
      user_id: userId,
      visitor_id: context.visitor_id,
    };
    this._processEvent('identify', payload, context);

    if (this._config.debug) {
      const trackingConsent = this._sessionManager.getTrackingConsent();
      this._logger.logIdentify(payload, { trackingConsent });
    }
  }

  updateTraits(traits: UserTraits) {
    const userId = this._sessionManager.getUserId();
    invariant(
      userId,
      'User must be identified with identify() before updating traits.'
    );

    const context = this._getContext();
    const payload = {
      environment: context.environment,
      traits,
      user_id: userId,
      visitor_id: context.visitor_id,
    };
    this._processEvent('identify', payload, context);

    if (this._config.debug) {
      const trackingConsent = this._sessionManager.getTrackingConsent();
      this._logger.logIdentify(payload, { trackingConsent });
    }
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

    const context = this._getContext();
    const payload: TrackPayload = {
      timestamp,
      event,
      environment: context.environment,
      user_id: context.user_id,
      session_id: context.session_id,
      visitor_id: context.visitor_id,
      properties: {
        [PROPERTY_LIB]: __LIB__,
        [PROPERTY_LIB_VERSION]: __LIB_VERSION__,
        [PROPERTY_RELEASE]: this._config.release,
        // The above properties might be overridden by user-provided fields
        // and the React library
        ...properties,
      },
    };

    this._processEvent('track', payload, context);

    if (this._config.debug) {
      const trackingConsent = this._sessionManager.getTrackingConsent();
      this._logger.logEvent(payload, { trackingConsent });
    }
  }

  getTrackingConsent(): TrackingConsentType {
    return this._sessionManager.getTrackingConsent();
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

  private _getContext(): AltertableContext {
    return {
      environment: this._config.environment,
      user_id: this._sessionManager.getUserId(),
      visitor_id: this._sessionManager.getVisitorId(),
      session_id: this._sessionManager.getSessionId(),
    };
  }

  private _processEvent<TPayload extends EventPayload>(
    eventType: EventType,
    payload: TPayload,
    context: AltertableContext
  ) {
    const trackingConsent = this._sessionManager.getTrackingConsent();

    switch (trackingConsent) {
      case TrackingConsent.GRANTED:
        try {
          this._request(`/${eventType}`, payload);
        } catch (error) {
          this._logger.error('Failed to send event', {
            error,
            eventType,
            payload,
          });
        }
        break;
      case TrackingConsent.PENDING:
      case TrackingConsent.DISMISSED:
        this._eventQueue.enqueue(eventType, payload, context);
        break;
      case TrackingConsent.DENIED:
        // Do nothing (don't collect or send data)
        break;
    }
  }

  private _request(path: string, body: unknown): void {
    invariant(this._apiKey, 'Missing API key');
    invariant(this._config, 'Missing configuration');

    const url = `${this._config.baseUrl}${path}`;
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
