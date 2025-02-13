export interface Config {
  baseUrl: string;
  autoCapture?: boolean;
}

export type EventProperties = Record<string, unknown>;

export const PAGEVIEW_EVENT = '$pageview';

export const SESSION_STORAGE_KEY = 'reaping-session-id';
export const LOCAL_STORAGE_KEY = 'reaping-visitor-id';
export const AUTO_CAPTURE_INTERVAL = 100;

export const PROPERTY_URL = '$url';
export const PROPERTY_SESSION_ID = '$sessionId';
export const PROPERTY_VISITOR_ID = '$visitorId';
export const PROPERTY_VIEWPORT = '$viewport';

export class Reaping {
  private _lastUrl: string;
  private _apiKey: string;
  private _config: Config;
  private _sessionId: string;
  private _visitorId: string;
  private _userId: string;

  constructor() {
    this._lastUrl = window.location.href;
    this._sessionId = this._generateId('session');
    this._visitorId = this._generateId('visitor');
    this._userId = this._generateId('anonymous');
  }

  init(apiKey: string, config: Config) {
    this._apiKey = apiKey;
    this._config = config;

    if (config.autoCapture !== false) {
      this.page(this._lastUrl);

      setInterval(() => {
        this._checkForChanges();
      }, AUTO_CAPTURE_INTERVAL);

      window.addEventListener('popstate', () => this._checkForChanges());
      window.addEventListener('hashchange', () => this._checkForChanges());
    }
  }

  identify(userId: string) {
    // FIXME: dummy implementation
    this._userId = userId;
  }

  page(url: string) {
    const parsedUrl = new URL(url);
    const urlWithoutSearch = `${parsedUrl.origin}${parsedUrl.pathname}`;
    this.track(PAGEVIEW_EVENT, {
      [PROPERTY_URL]: urlWithoutSearch,
      [PROPERTY_SESSION_ID]: this._getSessionId(),
      [PROPERTY_VISITOR_ID]: this._getVisitorId(),
      [PROPERTY_VIEWPORT]: this._getViewport(),
      ...Object.fromEntries(parsedUrl.searchParams),
    });
  }

  track(event: string, properties?: EventProperties) {
    this._request('/track', {
      event,
      user_id: this._userId,
      properties: properties || {},
    });
  }

  private _checkForChanges() {
    const currentUrl = window.location.href;
    if (currentUrl !== this._lastUrl) {
      this.page(currentUrl);
      this._lastUrl = currentUrl;
    }
  }

  private _request(path: string, body: unknown): void {
    const url = `${this._config.baseUrl}${path}`;
    const payload = JSON.stringify(body);

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const beaconUrl = `${url}?apiKey=${encodeURIComponent(this._apiKey)}`;
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(beaconUrl, blob);
    } else {
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
      let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!id) {
        id = this._sessionId;
        sessionStorage.setItem(SESSION_STORAGE_KEY, id);
      }
      return id;
    } catch {
      return this._sessionId;
    }
  }

  private _getVisitorId(): string {
    try {
      let id = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!id) {
        id = this._visitorId;
        localStorage.setItem(LOCAL_STORAGE_KEY, id);
      }
      return id;
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
    return `${window.innerWidth}x${window.innerHeight}`;
  }
}
