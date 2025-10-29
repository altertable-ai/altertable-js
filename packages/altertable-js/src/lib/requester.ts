import { EventPayload } from '../types';
import { ApiError, ApiErrorCode } from './error';
import { isBeaconSupported } from './isBeaconSupported';

export interface RequesterConfig {
  baseUrl: string;
  apiKey: string;
  requestTimeout: number;
}

export class Requester<TPayload extends EventPayload> {
  private readonly _config: Required<RequesterConfig>;

  constructor(config: RequesterConfig) {
    this._config = config;
  }

  private _constructUrl(path: string): string {
    return `${this._config.baseUrl}${path}?apiKey=${encodeURIComponent(
      this._config.apiKey
    )}`;
  }

  async send(path: string, payload: TPayload): Promise<void> {
    if (isBeaconSupported()) {
      return this._sendWithBeacon(path, payload);
    }

    return this._sendWithFetch(path, payload);
  }

  private async _sendWithBeacon(
    path: string,
    payload: TPayload
  ): Promise<void> {
    const url = this._constructUrl(path);
    const data = new Blob([JSON.stringify(payload)], {
      type: 'application/json',
    });

    try {
      const success = navigator.sendBeacon(url, data);
      if (!success) {
        return this._sendWithFetch(path, payload);
      }
    } catch (error) {
      return this._sendWithFetch(path, payload);
    }
  }

  private async _sendWithFetch(path: string, payload: TPayload): Promise<void> {
    const url = this._constructUrl(path);
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this._config.requestTimeout
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        keepalive: true,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorCode: ApiErrorCode | undefined;
        let details: any;

        try {
          details = await response.json();
          errorCode = details.error_code;
        } catch {
          // If parsing fails, continue without error_code
        }

        throw new ApiError(
          response.status,
          response.statusText,
          errorCode,
          details
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
