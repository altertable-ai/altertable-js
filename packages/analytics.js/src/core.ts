export interface Config {
  baseUrl: string;
  autoCapture?: boolean;
}

export type EventProperties = Record<string, unknown> | null | undefined;

export class Reaping {
  private _lastUrl: string;
  private _apiKey: string;
  private _config: Config;

  constructor() {
    this._lastUrl = window.location.href;
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
    this._request('/1/page', { url });
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
}
