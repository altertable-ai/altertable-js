import {
  AUTO_CAPTURE_INTERVAL_MS,
  EVENT_PAGEVIEW,
  keyBuilder,
  MAX_QUEUE_SIZE,
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
import { isAltertableError, isApiError, isNetworkError } from './lib/error';
import { invariant } from './lib/invariant';
import { dashboardUrl } from './lib/link';
import { createLogger } from './lib/logger';
import { parseUrl } from './lib/parseUrl';
import { Queue } from './lib/queue';
import { Requester } from './lib/requester';
import { captureRuntimeContext, RuntimeContext } from './lib/runtimeContext';
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
  AliasPayload,
  AltertableContext,
  DistinctId,
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
  /**
   * Optional error handler for intercepting SDK errors.
   */
  onError?: (error: Error) => void;
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
  private _queue: Queue<QueueItem>;
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
    this._queue = new Queue<QueueItem>({
      capacity: MAX_QUEUE_SIZE,
      onDropOldest: droppedItem => {
        const method =
          droppedItem.type === 'command'
            ? droppedItem.method
            : droppedItem.eventType;
        this._logger.warnDev(
          `Queue is full (${MAX_QUEUE_SIZE} items). Dropping ${method} call.`
        );
      },
    });
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

    const trackingConsent = this._sessionManager.getTrackingConsent();
    if (trackingConsent === TrackingConsent.GRANTED) {
      this._flushQueue();
    } else if (trackingConsent === TrackingConsent.DENIED) {
      this._queue.clear();
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
        this._flushQueue();
      } else if (updates.trackingConsent === TrackingConsent.DENIED) {
        this._queue.clear();
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
   * Notes:
   * - You can call this method multiple times with the same ID.
   * - To change traits, use {@link updateTraits} instead.
   * - To switch to a new user ID, call {@link reset} first.
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
  identify(userId: DistinctId, traits: UserTraits = {}) {
    try {
      validateUserId(userId);
    } catch (error) {
      throw new Error(`[Altertable] ${error.message}`);
    }

    if (!this._isInitialized) {
      this._queue.enqueue({
        type: 'command',
        method: 'identify',
        args: [userId, { ...traits }],
      });
      return;
    }

    this._identify(userId, { ...traits });
  }

  private _identify(userId: DistinctId, traits: UserTraits = {}) {
    invariant(
      !this._sessionManager.isIdentified() ||
        userId === this._sessionManager.getDistinctId(),
      `User (${userId}) is already identified as a different user (${this._sessionManager.getDistinctId()}). This usually indicates a development issue, as it would merge two separate identities. Call reset() before identifying a new user, or use alias() to link the new ID to the existing one.`
    );

    if (userId !== this._sessionManager.getDistinctId()) {
      this._sessionManager.identify(userId);
    }

    const context = this._getContext();
    const payload: IdentifyPayload = {
      environment: context.environment,
      device_id: context.device_id,
      distinct_id: context.distinct_id,
      traits,
      anonymous_id: context.anonymous_id,
    };
    this._processEvent('identify', payload);

    if (this._config.debug) {
      const trackingConsent = this._sessionManager.getTrackingConsent();
      this._logger.logIdentify(payload, { trackingConsent });
    }
  }

  /**
   * Link a new ID to the current identity.
   *
   * @param newUserId The new user ID
   *
   * @example
   * ```javascript
   * altertable.alias('u_01jza857w4f23s1hf2s61befmw');
   * ```
   */
  alias(newUserId: DistinctId) {
    try {
      validateUserId(newUserId);
    } catch (error) {
      throw new Error(`[Altertable] ${error.message}`);
    }

    if (!this._isInitialized) {
      this._queue.enqueue({
        type: 'command',
        method: 'alias',
        args: [newUserId],
      });
      return;
    }

    this._alias(newUserId);
  }

  private _alias(newUserId: DistinctId) {
    const context = this._getContext();

    const payload: AliasPayload = {
      environment: context.environment,
      device_id: context.device_id,
      anonymous_id: context.anonymous_id,
      distinct_id: context.distinct_id,
      new_user_id: newUserId,
    };

    this._processEvent('alias', payload);

    if (this._config.debug) {
      const trackingConsent = this._sessionManager.getTrackingConsent();
      this._logger.logAlias(payload, { trackingConsent });
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
    if (!this._isInitialized) {
      this._queue.enqueue({
        type: 'command',
        method: 'updateTraits',
        args: [{ ...traits }],
      });
      return;
    }

    this._updateTraits({ ...traits });
  }

  private _updateTraits(traits: UserTraits) {
    const context = this._getContext();

    invariant(
      context.anonymous_id !== null,
      'User must be identified with identify() before updating traits.'
    );

    const payload = {
      environment: context.environment,
      device_id: context.device_id,
      distinct_id: context.distinct_id,
      traits,
      anonymous_id: context.anonymous_id,
      session_id: context.session_id,
    };
    this._processEvent('identify', payload);

    if (this._config.debug) {
      const trackingConsent = this._sessionManager.getTrackingConsent();
      this._logger.logIdentify(payload, { trackingConsent });
    }
  }

  /**
   * Resets device and session IDs.
   *
   * @example
   * ```javascript
   * // Reset session, user and visitor (default)
   * altertable.reset();
   *
   * // Reset session, user, visitor and device
   * altertable.reset({
   *   resetDeviceId: true,
   * });
   * ```
   */
  reset({
    resetDeviceId = false,
  }: {
    /** Whether to reset device ID (default: false) */
    resetDeviceId?: boolean;
  } = {}) {
    // Clear queued commands to prevent cross-identity/session mixing
    this._queue.clear();

    if (!this._isInitialized) {
      return;
    }

    this._sessionManager.reset({
      resetDeviceId,
    });
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
    if (!this._isInitialized) {
      this._queue.enqueue({
        type: 'command',
        method: 'page',
        runtimeContext: captureRuntimeContext(),
        args: [url],
      });
      return;
    }

    this._page(url);
  }

  private _page(url: string, runtimeContext?: RuntimeContext) {
    const parsedUrl = parseUrl(url);
    const baseUrl = parsedUrl ? parsedUrl.baseUrl : url;

    const viewport = runtimeContext?.viewport ?? getViewport();
    const referrer = runtimeContext?.referrer ?? this._referrer;

    this._track(
      EVENT_PAGEVIEW,
      {
        [PROPERTY_URL]: baseUrl,
        [PROPERTY_VIEWPORT]: viewport,
        [PROPERTY_REFERER]: referrer,
        ...parsedUrl?.searchParams,
      },
      runtimeContext
    );
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
    if (!this._isInitialized) {
      this._queue.enqueue({
        type: 'command',
        method: 'track',
        runtimeContext: captureRuntimeContext(),
        args: [event, { ...properties }],
      });
      return;
    }

    this._track(event, { ...properties });
  }

  private _track(
    event: string,
    properties: EventProperties,
    runtimeContext: RuntimeContext = captureRuntimeContext()
  ) {
    this._sessionManager.renewSessionIfNeeded();
    this._sessionManager.updateLastEventAt(runtimeContext.timestamp);

    const context = this._getContext();

    // Strip undefined $url to prevent it from overriding computed URL
    const { [PROPERTY_URL]: userUrl, ...restProperties } = properties;
    const hasUrl = userUrl !== undefined;
    const urlForEvent = hasUrl ? null : runtimeContext.url;

    const parsedUrl = urlForEvent ? parseUrl(urlForEvent) : null;
    const baseUrl = parsedUrl ? parsedUrl.baseUrl : urlForEvent;

    const payload: TrackPayload = {
      timestamp: runtimeContext.timestamp,
      event,
      environment: context.environment,
      device_id: context.device_id,
      distinct_id: context.distinct_id,
      anonymous_id: context.anonymous_id,
      session_id: context.session_id,
      properties: {
        [PROPERTY_LIB]: __LIB__,
        [PROPERTY_LIB_VERSION]: __LIB_VERSION__,
        [PROPERTY_RELEASE]: this._config.release,
        [PROPERTY_URL]: hasUrl ? userUrl : baseUrl,
        // The above properties might be overridden by user-provided fields
        // and the React library
        ...restProperties,
      },
    };

    this._processEvent('track', payload);

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
    if (!this._isInitialized) {
      return TrackingConsent.PENDING;
    }
    return this._sessionManager.getTrackingConsent();
  }

  private _flushQueue() {
    const items = this._queue.flush();

    if (items.length === 0) {
      return;
    }

    if (this._config.debug) {
      this._logger.log(
        `Processing ${items.length} queued ${items.length === 1 ? 'item' : 'items'}.`
      );
    }

    for (const item of items) {
      this._executeQueueItem(item);
    }
  }

  private _executeQueueItem(item: QueueItem) {
    if (item.type === 'event') {
      // Send pre-built payload directly (preserves original session context)
      this._sendEvent(item.eventType, item.payload);
      return;
    }
    // Execute command (pre-init path)
    this._executeCommand(item);
  }

  private _executeCommand(cmd: QueuedCommand) {
    try {
      switch (cmd.method) {
        case 'identify':
          this._identify(...cmd.args);
          break;
        case 'track':
          this._track(...cmd.args, cmd.runtimeContext);
          break;
        case 'page':
          this._page(...cmd.args, cmd.runtimeContext);
          break;
        case 'alias':
          this._alias(...cmd.args);
          break;
        case 'updateTraits':
          this._updateTraits(...cmd.args);
          break;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this._logger.warnDev(
        `Failed to process queued ${cmd.method}() command:\n${errorMessage}`
      );
    }
  }

  private _checkForChanges() {
    safelyRunOnBrowser(({ window }) => {
      const currentUrl = window.location.href;
      if (currentUrl !== this._lastUrl) {
        this._referrer = this._lastUrl;
        this._lastUrl = currentUrl;
        this.page(currentUrl);
      }
    });
  }

  private _getContext(): AltertableContext {
    return {
      environment: this._config.environment,
      device_id: this._sessionManager.getDeviceId(),
      distinct_id: this._sessionManager.getDistinctId(),
      anonymous_id: this._sessionManager.getAnonymousId(),
      session_id: this._sessionManager.getSessionId(),
    };
  }

  private _processEvent<TPayload extends EventPayload>(
    eventType: EventType,
    payload: TPayload
  ) {
    const trackingConsent = this._sessionManager.getTrackingConsent();

    switch (trackingConsent) {
      case TrackingConsent.GRANTED:
        this._sendEvent(eventType, payload);
        break;
      case TrackingConsent.PENDING:
      case TrackingConsent.DISMISSED:
        this._queue.enqueue({
          type: 'event',
          eventType,
          payload,
        });
        break;
      case TrackingConsent.DENIED:
        // Do nothing (don't collect or send data)
        break;
    }
  }

  private async _sendEvent<TPayload extends EventPayload>(
    eventType: EventType,
    payload: TPayload
  ) {
    try {
      await this._requester.send(`/${eventType}`, payload);
    } catch (error) {
      if (isAltertableError(error)) {
        this._config.onError?.(error);
      }

      if (isApiError(error) && error.errorCode === 'environment-not-found') {
        this._logger.warnDev(
          `Environment "${this._config.environment}" not found. Please create this environment in your Altertable dashboard at ${dashboardUrl(`/environments/new?name=${this._config.environment}`)} before tracking events.`
        );
      } else if (isNetworkError(error)) {
        this._logger.error('Network error while sending event', {
          error: error.message,
          cause: error.cause,
          eventType,
        });
      } else {
        this._logger.error('Failed to send event', {
          error,
          eventType,
          payload,
        });
      }
    }
  }
}

type QueuedCommand =
  | {
      type: 'command';
      method: 'identify';
      args: Parameters<Altertable['identify']>;
    }
  | {
      type: 'command';
      method: 'track';
      args: Parameters<Altertable['track']>;
      runtimeContext: RuntimeContext;
    }
  | {
      type: 'command';
      method: 'page';
      args: Parameters<Altertable['page']>;
      runtimeContext: RuntimeContext;
    }
  | {
      type: 'command';
      method: 'alias';
      args: Parameters<Altertable['alias']>;
    }
  | {
      type: 'command';
      method: 'updateTraits';
      args: Parameters<Altertable['updateTraits']>;
    };

type QueuedEvent = {
  type: 'event';
  eventType: EventType;
  payload: EventPayload;
};

type QueueItem = QueuedCommand | QueuedEvent;
