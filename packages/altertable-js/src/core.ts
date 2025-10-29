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
  REQUEST_TIMEOUT_MS,
  TrackingConsent,
  TrackingConsentType,
} from './constants';
import { EventQueue } from './lib/eventQueue';
import { invariant } from './lib/invariant';
import { createLogger } from './lib/logger';
import { parseUrl } from './lib/parseUrl';
import { Requester } from './lib/requester';
import { safelyRunOnBrowser } from './lib/safelyRunOnBrowser';
import { SessionManager } from './lib/sessionManager';
import {
  selectStorage,
  type StorageApi,
  type StorageType,
} from './lib/storage';
import { validateUserId } from './lib/validateUserId';
import { getViewport } from './lib/viewport';
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
   * @default "granted"
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
  trackingConsent: TrackingConsent.GRANTED,
};

export class Altertable {
  private _cleanupAutoCapture: (() => void) | undefined;
  private _config: AltertableConfig;
  private _eventQueue: EventQueue<EventPayload>;
  private _isInitialized = false;
  private _lastUrl: string | null;
  private _logger = createLogger('Altertable');
  private _referrer: string | null;
  private _requester: Requester<EventPayload> | undefined;
  private _sessionManager: SessionManager | undefined;
  private _storage: StorageApi | undefined;
  private _storageKey: string | undefined;

  constructor() {
    this._lastUrl = null;
    this._referrer = null;
    this._eventQueue = new EventQueue(MAX_EVENT_QUEUE_SIZE);
  }

  /**
   * Initializes the Altertable SDK with your API key and optional configuration.
   *
   * @param apiKey Your Altertable API key
   * @param config Configuration options
   * @returns A cleanup function to remove event listeners
   *
   * @example
   * ```javascript
   * altertable.init('YOUR_API_KEY', {
   *   environment: 'development',
   * });
   * ```
   */
  init(apiKey: string, config: AltertableConfig = {}) {
    invariant(apiKey, 'Missing API key');
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
    this._requester = new Requester({
      baseUrl: this._config.baseUrl,
      apiKey,
      requestTimeout: REQUEST_TIMEOUT_MS,
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

  /**
   * Updates the configuration after initialization.
   *
   * @param updates Configuration updates to apply
   *
   * @example
   * ```javascript
   * altertable.configure({
   *   trackingConsent: 'granted',
   * });
   * ```
   */
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

  /**
   * Identifies a user with their ID and optional traits.
   *
   * @param userId The user's unique identifier
   * @param traits User properties
   *
   * @example
   * ```javascript
   * altertable.identify('u_01jza857w4f23s1hf2s61befmw', {
   *   email: 'john.doe@example.com',
   *   name: 'John Doe',
   *   company: 'Acme Corp',
   *   role: 'Software Engineer',
   * });
   * ```
   */
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

  /**
   * Updates user traits for the current user.
   *
   * @param traits User properties to update
   *
   * @example
   * ```javascript
   * altertable.updateTraits({
   *   onboarding_completed: true,
   * });
   * ```
   */
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

  /**
   * Resets visitor and session IDs.
   *
   * @example
   * ```javascript
   * // Reset session only (default)
   * altertable.reset();
   *
   * // Reset both visitor and session
   * altertable.reset({
   *   resetVisitorId: true,
   *   resetSessionId: true,
   * });
   * ```
   */
  reset({
    resetVisitorId = false,
    resetSessionId = true,
  }: {
    /** Whether to reset visitor ID (default: false) */
    resetVisitorId?: boolean;
    /** Whether to reset session ID (default: true) */
    resetSessionId?: boolean;
  } = {}) {
    invariant(
      this._isInitialized,
      'The client must be initialized with init() before resetting.'
    );

    this._sessionManager.reset({ resetVisitorId, resetSessionId });
  }

  /**
   * Tracks a page view event.
   *
   * When `autoCapture` is enabled (default), this method is automatically called when the page URL changes.
   *
   * @param url The page URL
   *
   * @example
   * ```javascript
   * altertable.page('https://example.com/products');
   * ```
   *
   * @remarks
   * **Page Tracking**: By default, Altertable automatically captures page views. Only use `page()` when you've disabled auto-capture.
   *
   * **Why use auto-capture (default)?**
   * - No manual tracking required
   * - Handles browser navigation events (popstate, hashchange)
   * - Consistent tracking across all page changes
   *
   * **When to use `page()`:**
   * - Custom routing that doesn't trigger browser events
   * - Virtual page views that don't trigger URL changes (modals, step changes)
   * - Server-side tracking where auto-capture isn't available
   */
  page(url: string) {
    invariant(
      this._isInitialized,
      'The client must be initialized with init() before tracking page views.'
    );

    const parsedUrl = parseUrl(url);
    const baseUrl = parsedUrl ? parsedUrl.baseUrl : url;

    this.track(EVENT_PAGEVIEW, {
      [PROPERTY_URL]: baseUrl,
      [PROPERTY_VIEWPORT]: getViewport(),
      [PROPERTY_REFERER]: this._referrer,
      ...parsedUrl?.searchParams,
    });
  }

  /**
   * Tracks a custom event with optional properties.
   *
   * @param eventThe event name
   * @param properties Custom event properties
   *
   * @example
   * ```javascript
   * altertable.track('Purchase Completed', {
   *   product_id: 'p_01jza8fr5efvgbxxdd1bwkd0m5',
   *   amount: 29.99,
   *   currency: 'USD',
   * });
   * ```
   */
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
        ...(properties[PROPERTY_URL] === undefined &&
          (() => {
            const currentUrl = safelyRunOnBrowser<string | null>(
              ({ window }) => window.location.href || null,
              () => null
            );
            const parsedUrl = parseUrl(currentUrl);
            const baseUrl = parsedUrl ? parsedUrl.baseUrl : currentUrl;
            return { [PROPERTY_URL]: baseUrl };
          })()),
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

  /**
   * Returns the current tracking consent state.
   *
   * @returns The current tracking consent state
   * @see {@link TrackingConsent}
   *
   * @example
   * ```javascript
   * const consent = altertable.getTrackingConsent();
   * if (consent === 'granted') {
   *   // Tracking is allowed
   * }
   * ```
   */
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

  private async _processEvent<TPayload extends EventPayload>(
    eventType: EventType,
    payload: TPayload,
    context: AltertableContext
  ) {
    const trackingConsent = this._sessionManager.getTrackingConsent();

    switch (trackingConsent) {
      case TrackingConsent.GRANTED:
        try {
          await this._requester.send(`/${eventType}`, payload);
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
}
