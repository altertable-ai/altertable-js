import { isBeaconSupported } from './isBeaconSupported';
import { createLogger } from './logger';

export interface RequesterConfig {
  baseUrl: string;
  apiKey: string;
  requestTimeout: number;
}

export class Requester {
  private readonly _config: Required<RequesterConfig>;
  private readonly _logger = createLogger('Altertable:Requester');

  constructor(config: RequesterConfig) {
    this._config = config;
  }

  async send(path: string, payload: unknown): Promise<void> {
    if (isBeaconSupported()) {
      this._sendWithBeacon(path, payload);
      return;
    }

    await this._sendWithFetch(path, payload);
  }

  private _sendWithBeacon(path: string, payload: unknown): void {
    const url = `${this._config.baseUrl}${path}?apiKey=${encodeURIComponent(
      this._config.apiKey
    )}`;
    const data = new Blob([JSON.stringify(payload)], {
      type: 'application/json',
    });

    try {
      const success = navigator.sendBeacon(url, data);
      if (!success) {
        this._logger.warn('sendBeacon failed, falling back to fetch');
        this._sendWithFetch(path, payload).catch(error => {
          this._logger.error('Fetch fallback also failed:', error);
        });
      }
    } catch (error) {
      this._logger.warn(
        'sendBeacon threw error, falling back to fetch:',
        error
      );
      this._sendWithFetch(path, payload).catch(fetchError => {
        this._logger.error('Fetch fallback also failed:', fetchError);
      });
    }
  }

  private async _sendWithFetch(path: string, payload: unknown): Promise<void> {
    const url = `${this._config.baseUrl}${path}?apiKey=${encodeURIComponent(
      this._config.apiKey
    )}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this._config.requestTimeout
    );

    try {
      const response = await fetch(url, {
        keepalive: true,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
