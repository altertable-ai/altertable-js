export interface Config {
  baseUrl: string;
  autoCapture?: boolean;
}

export type EventProperties = Record<string, unknown> | null | undefined;

export const PAGEVIEW_EVENT = 'pageview';
export const SESSION_STORAGE_KEY = 'reaping-session-id';
export const LOCAL_STORAGE_KEY = 'reaping-visitor-id';

export class Reaping {
  private _lastUrl: string;
  private _apiKey: string;
  private _config: Config;
  private _sessionId: string;
  private _visitorId: string;

  constructor() {
    this._lastUrl = window.location.href;
    this._sessionId = this._generateId('session');
    this._visitorId = this._generateId('visitor');
  }

  init(apiKey: string, config: Config) {
    this._apiKey = apiKey;
    this._config = config;

    if (config.autoCapture !== false) {
      this.page(this._lastUrl);

      setInterval(() => {
        this._checkForChanges();
      }, 100);

      window.addEventListener('popstate', () => this._checkForChanges());
      window.addEventListener('hashchange', () => this._checkForChanges());
    }
  }

  page(url: string) {
    this.track(PAGEVIEW_EVENT, {
      url,
      sessionId: this._getSessionId(),
      visitorId: this._getVisitorId(),
    });
  }

  track(event: string, properties: EventProperties) {
    this._request('/1/track', { event, properties });
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
}
