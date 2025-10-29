import { ApiErrorResponse, EventPayload } from '../types';
import { ApiError, NetworkError } from './error';
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
        let errorResponse: ApiErrorResponse | undefined;

        try {
          errorResponse = await response.json();
        } catch {
          // If parsing fails, continue without parsed response
        }

        throw new ApiError(
          response.status,
          response.statusText,
          errorResponse?.error_code,
          errorResponse,
          {
            url,
            method: 'POST',
            payload,
          }
        );
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new NetworkError(
        error instanceof Error ? error.message : 'Network request failed',
        error
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
