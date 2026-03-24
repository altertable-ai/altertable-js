import {
  HTTP_REQUEST_MAX_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
} from '../constants';
import { EventPayload } from '../types';
import {
  ApiError,
  ApiErrorResponse,
  isRetryableHttpDeliveryError,
  NetworkError,
} from './error';
import { isBeaconSupported } from './isBeaconSupported';

export type RequesterConfig = {
  baseUrl: string;
  apiKey: string;
  requestTimeout: number;
  /** @internal Override for tests — defaults to {@link HTTP_REQUEST_MAX_ATTEMPTS}; clamped to at least 1. */
  maxHttpAttempts?: number;
  /** @internal Override for tests — defaults to {@link RETRY_BASE_DELAY_MS}. */
  retryBaseDelayMs?: number;
};

function sleep(durationMs: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, durationMs);
  });
}

function exponentialBackoffWithJitterMs(baseDelayMs: number, attemptIndex: number): number {
  const exponentialMs = baseDelayMs * 2 ** attemptIndex;
  return exponentialMs * (0.5 + Math.random());
}

export class Requester<TPayload extends EventPayload> {
  private readonly _config: Required<
    Omit<RequesterConfig, 'maxHttpAttempts' | 'retryBaseDelayMs'>
  > & {
    maxHttpAttempts: number;
    retryBaseDelayMs: number;
  };

  constructor(config: RequesterConfig) {
    this._config = {
      ...config,
      maxHttpAttempts: Math.max(
        1,
        config.maxHttpAttempts ?? HTTP_REQUEST_MAX_ATTEMPTS
      ),
      retryBaseDelayMs: config.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS,
    };
  }

  private _constructUrl(path: string): string {
    return `${this._config.baseUrl}${path}?apiKey=${encodeURIComponent(
      this._config.apiKey
    )}`;
  }

  /**
   * Sends a batch (JSON array body) with fetch + keepalive and retries transient failures.
   */
  async sendBatch(path: string, payloads: TPayload[]): Promise<void> {
    if (payloads.length === 0) {
      return;
    }
    await this._sendWithFetchRetry(path, JSON.stringify(payloads));
  }

  /**
   * Best-effort delivery during page unload (sendBeacon when available).
   */
  sendUnload(path: string, payloads: TPayload[]): void {
    if (payloads.length === 0) {
      return;
    }
    const url = this._constructUrl(path);
    const body = JSON.stringify(payloads);
    const blob = new Blob([body], {
      type: 'application/json',
    });

    try {
      if (isBeaconSupported()) {
        const queued = navigator.sendBeacon(url, blob);
        if (queued) {
          return;
        }
      }
    } catch {
      // Fall through to fetch keepalive.
    }

    void fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      keepalive: true,
    }).catch(() => {
      // Unload path: swallow errors.
    });
  }

  private async _sendWithFetchRetry(
    path: string,
    body: string
  ): Promise<void> {
    const url = this._constructUrl(path);
    let lastError: unknown;

    const maxAttempts = this._config.maxHttpAttempts;
    const baseDelay = this._config.retryBaseDelayMs;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const waitMs = exponentialBackoffWithJitterMs(baseDelay, attempt - 1);
        await sleep(waitMs);
      }

      try {
        await this._sendOnceWithFetch(url, body);
        return;
      } catch (error) {
        lastError = error;
        if (!isRetryableHttpDeliveryError(error)) {
          throw error;
        }
        if (attempt === maxAttempts - 1) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private async _sendOnceWithFetch(url: string, body: string): Promise<void> {
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
        body,
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

        let payloadForContext: unknown = body;
        try {
          payloadForContext = JSON.parse(body) as unknown;
        } catch {
          // Keep raw body string for request context
        }

        throw new ApiError(
          response.status,
          response.statusText,
          errorResponse?.error_code,
          errorResponse,
          {
            url,
            method: 'POST',
            payload: payloadForContext,
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
