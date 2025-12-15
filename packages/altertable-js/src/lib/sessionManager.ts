import {
  PREFIX_DEVICE_ID,
  PREFIX_SESSION_ID,
  PREFIX_VISITOR_ID,
  SESSION_EXPIRATION_TIME_MS,
  TrackingConsent,
  TrackingConsentType,
} from '../constants';
import type {
  DeviceId,
  DistinctId,
  SessionId,
  UserId,
  VisitorId,
} from '../types';
import { generateId } from './generateId';
import { Logger } from './logger';
import { type StorageApi } from './storage';

type SessionData = {
  deviceId: DeviceId;
  distinctId: DistinctId;
  anonymousId: VisitorId | null;
  sessionId: SessionId;
  lastEventAt: string | null;
  trackingConsent: TrackingConsentType;
};

export class SessionManager {
  private _defaultTrackingConsent: TrackingConsentType;
  private _logger: Logger;
  private _sessionData: SessionData;
  private _storage: StorageApi;
  private _storageKey: string;

  constructor(options: {
    storage: StorageApi;
    storageKey: string;
    logger: Logger;
    defaultTrackingConsent: TrackingConsentType;
  }) {
    this._storage = options.storage;
    this._storageKey = options.storageKey;
    this._logger = options.logger;
    this._defaultTrackingConsent =
      options.defaultTrackingConsent ?? TrackingConsent.PENDING;
    this._sessionData = this._createDefaultSessionData();
  }

  init(): void {
    const storedData = this._storage.getItem(this._storageKey);

    if (!storedData) {
      this._sessionData = this._createDefaultSessionData();
      this._persistToStorage();
      return;
    }

    try {
      const parsedData = JSON.parse(storedData) as Partial<SessionData>;

      this._sessionData = {
        deviceId: parsedData.deviceId || this._generateDeviceId(),
        distinctId: parsedData.distinctId || this._generateVisitorId(),
        sessionId: parsedData.sessionId || this._generateSessionId(),
        anonymousId: parsedData.anonymousId || null,
        lastEventAt: parsedData.lastEventAt || null,
        trackingConsent: isValidTrackingConsent(parsedData.trackingConsent)
          ? parsedData.trackingConsent
          : this._defaultTrackingConsent,
      };
    } catch (error) {
      this._logger.warnDev(
        'Failed to parse storage data. Resetting session data.'
      );
      this._sessionData = this._createDefaultSessionData();
    }

    this._persistToStorage();
  }

  getSessionId(): SessionId {
    return this._sessionData.sessionId;
  }

  getDeviceId(): DeviceId {
    return this._sessionData.deviceId;
  }

  getDistinctId(): DistinctId {
    return this._sessionData.distinctId;
  }

  getAnonymousId(): VisitorId | null {
    return this._sessionData.anonymousId;
  }

  /**
   * Returns whether the current user is identified.
   *
   * The `anonymousId` field is a "before" snapshot: if set, the user was previously
   * anonymous and is now identified. If `null`, the user is still anonymous.
   *
   * When transitioning from anonymous to identified, we preserve the anonymous ID
   * to enable identity merging on the backend. This allows:
   * - Linking pre-identification events (anonymous visitor ID) to post-identification events (user ID)
   * - Merging user profiles so anonymous browsing behavior is associated with the identified user
   * - Maintaining a complete user journey from first visit through identification
   *
   * **State Transitions:**
   * - **Anonymous:** `anonymousId = null`, `distinctId = visitorId`, `isIdentified() = false`
   * - **Identified:** `anonymousId = previous visitorId`, `distinctId = userId`, `isIdentified() = true`
   */
  isIdentified(): boolean {
    return Boolean(this._sessionData.anonymousId);
  }

  getLastEventAt(): string | null {
    return this._sessionData.lastEventAt;
  }

  getTrackingConsent(): TrackingConsentType {
    return this._sessionData.trackingConsent;
  }

  identify(userId: UserId): void {
    this._sessionData.anonymousId = this._sessionData.distinctId as VisitorId;
    this._sessionData.distinctId = userId;
    this._persistToStorage();
  }

  setTrackingConsent(consent: TrackingConsentType): void {
    this._sessionData.trackingConsent = consent;
    this._persistToStorage();
  }

  updateLastEventAt(timestamp: string): void {
    this._sessionData.lastEventAt = timestamp;
    this._persistToStorage();
  }

  renewSessionIfNeeded(): boolean {
    const shouldRenew = this._shouldRenewSession();

    if (shouldRenew) {
      this._renewSession();
      this._persistToStorage();
      return true;
    }

    return false;
  }

  reset({
    resetDeviceId = false,
    resetTrackingConsent = false,
  }: {
    resetDeviceId?: boolean;
    resetTrackingConsent?: boolean;
  } = {}): void {
    if (resetDeviceId) {
      this._sessionData.deviceId = this._generateDeviceId();
    }

    if (resetTrackingConsent) {
      this._sessionData.trackingConsent = this._defaultTrackingConsent;
    }

    this._sessionData.sessionId = this._generateSessionId();
    this._sessionData.anonymousId = null;
    this._sessionData.distinctId = this._generateVisitorId();
    this._sessionData.lastEventAt = null;
    this._persistToStorage();
  }

  private _createDefaultSessionData(): SessionData {
    return {
      anonymousId: null,
      deviceId: this._generateDeviceId(),
      distinctId: this._generateVisitorId(),
      lastEventAt: null,
      sessionId: this._generateSessionId(),
      trackingConsent: this._defaultTrackingConsent,
    };
  }

  private _generateSessionId(): SessionId {
    return generateId(PREFIX_SESSION_ID);
  }

  private _generateDeviceId(): DeviceId {
    return generateId(PREFIX_DEVICE_ID);
  }

  private _generateVisitorId(): VisitorId {
    return generateId(PREFIX_VISITOR_ID);
  }

  private _shouldRenewSession(): boolean {
    const { lastEventAt } = this._sessionData;

    if (!lastEventAt) {
      return true;
    }

    const now = new Date().getTime();
    const lastEventTime = new Date(lastEventAt).getTime();
    const timeSinceLastEvent = now - lastEventTime;

    return timeSinceLastEvent > SESSION_EXPIRATION_TIME_MS;
  }

  private _renewSession(): void {
    this._sessionData.sessionId = this._generateSessionId();
    this._sessionData.lastEventAt = null;
  }

  private _persistToStorage(): void {
    try {
      this._storage.setItem(
        this._storageKey,
        JSON.stringify(this._sessionData)
      );
    } catch (error) {
      this._logger.warnDev('Failed to persist session data to storage.');
    }
  }
}

function isValidTrackingConsent(value: unknown): value is TrackingConsentType {
  return (
    typeof value === 'string' &&
    Object.values(TrackingConsent).includes(value as TrackingConsentType)
  );
}
