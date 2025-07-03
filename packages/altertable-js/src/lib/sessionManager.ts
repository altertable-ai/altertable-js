import {
  PREFIX_SESSION_ID,
  PREFIX_VISITOR_ID,
  SESSION_EXPIRATION_TIME_MS,
  STORAGE_KEY,
  TrackingConsent,
  TrackingConsentType,
} from '../constants';
import { generateId } from './generateId';
import { Logger } from './logger';
import { type StorageApi } from './storage';
import type { UserId, VisitorId, SessionId } from '../types';

type SessionData = {
  visitorId: VisitorId;
  sessionId: SessionId;
  userId: UserId | null;
  lastEventAt: string | null;
  trackingConsent: TrackingConsentType;
};

export class SessionManager {
  private _logger: Logger;
  private _storage: StorageApi;
  private _sessionData: SessionData;
  private _defaultTrackingConsent: TrackingConsentType;

  constructor(options: {
    storage: StorageApi;
    logger: Logger;
    defaultTrackingConsent: TrackingConsentType;
  }) {
    this._storage = options.storage;
    this._logger = options.logger;
    this._defaultTrackingConsent =
      options.defaultTrackingConsent ?? TrackingConsent.PENDING;
    this._sessionData = this._createDefaultSessionData();
  }

  init(): void {
    const storedData = this._storage.getItem(STORAGE_KEY);

    if (!storedData) {
      this._sessionData = this._createDefaultSessionData();
      this._persistToStorage();
      return;
    }

    try {
      const parsedData = JSON.parse(storedData) as Partial<SessionData>;

      this._sessionData = {
        visitorId: parsedData.visitorId || this._generateVisitorId(),
        sessionId: parsedData.sessionId || this._generateSessionId(),
        userId: parsedData.userId || null,
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

  getVisitorId(): VisitorId {
    return this._sessionData.visitorId;
  }

  getSessionId(): SessionId {
    return this._sessionData.sessionId;
  }

  getUserId(): UserId | null {
    return this._sessionData.userId;
  }

  getLastEventAt(): string | null {
    return this._sessionData.lastEventAt;
  }

  getTrackingConsent(): TrackingConsentType {
    return this._sessionData.trackingConsent;
  }

  setUserId(userId: UserId | null): void {
    this._sessionData.userId = userId;
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
    resetVisitorId = false,
    resetSessionId = true,
    resetTrackingConsent = false,
  }: {
    resetVisitorId?: boolean;
    resetSessionId?: boolean;
    resetTrackingConsent?: boolean;
  } = {}): void {
    if (resetVisitorId) {
      this._sessionData.visitorId = this._generateVisitorId();
    }

    if (resetSessionId) {
      this._sessionData.sessionId = this._generateSessionId();
    }

    if (resetTrackingConsent) {
      this._sessionData.trackingConsent = this._defaultTrackingConsent;
    }

    this._sessionData.userId = null;
    this._sessionData.lastEventAt = null;
    this._persistToStorage();
  }

  private _createDefaultSessionData(): SessionData {
    return {
      visitorId: this._generateVisitorId(),
      sessionId: this._generateSessionId(),
      userId: null,
      lastEventAt: null,
      trackingConsent: this._defaultTrackingConsent,
    };
  }

  private _generateSessionId(): SessionId {
    return generateId(PREFIX_SESSION_ID);
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
      this._storage.setItem(STORAGE_KEY, JSON.stringify(this._sessionData));
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
