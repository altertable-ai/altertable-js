import { HTTP_REQUEST_MAX_ATTEMPTS, RETRY_BASE_DELAY_MS } from '../constants';
import type { EventPayload } from '../types';
import {
  ApiError,
  ApiErrorResponse,
  isRetryableHttpDeliveryError,
  NetworkError,
} from './error';

export type RequesterConfig = {
  baseUrl: string;
  apiKey: string;
  requestTimeout: number;
  /** Applied to normal, retry, and exit delivery. */
  requestOptions?: Pick<RequestInit, 'credentials' | 'referrerPolicy'>;
  /** @internal Override for tests — defaults to {@link HTTP_REQUEST_MAX_ATTEMPTS}; clamped to at least 1. */
  maxHttpAttempts?: number;
  /** @internal Override for tests — defaults to {@link RETRY_BASE_DELAY_MS}. */
  retryBaseDelayMs?: number;
};

function waitForRetry(durationMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timeoutId = setTimeout(finish, durationMs);
    signal?.addEventListener('abort', finish, { once: true });
    if (signal?.aborted) finish();
  });
}

function getRetryDelayMs(baseDelayMs: number, attemptIndex: number): number {
  const exponentialMs = baseDelayMs * 2 ** attemptIndex;
  return exponentialMs * (0.5 + Math.random());
}

export class Requester<TPayload extends EventPayload> {
  private _config: Required<Omit<RequesterConfig, 'requestOptions'>>;
  private readonly _requestOptions: Pick<
    RequestInit,
    'credentials' | 'referrerPolicy'
  >;

  constructor(config: RequesterConfig) {
    const { requestOptions, ...options } = config;
    this._config = {
      ...options,
      maxHttpAttempts: Math.max(
        1,
        config.maxHttpAttempts ?? HTTP_REQUEST_MAX_ATTEMPTS
      ),
      retryBaseDelayMs: config.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS,
    };
    this._requestOptions = { ...requestOptions };
  }

  /** Apply to future sends; ongoing batches keep their captured URL across retries. */
  setBaseUrl(baseUrl: string): void {
    this._config.baseUrl = baseUrl;
  }

  private _constructUrl(path: string): string {
    return `${this._config.baseUrl}${path}?apiKey=${encodeURIComponent(this._config.apiKey)}`;
  }

  /**
   * Sends a batch (JSON array body) with fetch + keepalive and retries transient failures.
   * Cancellation aborts the current attempt, clears backoff, and resolves without retrying.
   */
  async sendBatch(
    path: string,
    payloads: TPayload[],
    signal?: AbortSignal
  ): Promise<void> {
    if (payloads.length === 0) {
      return;
    }
    await this._sendWithFetchRetry(
      path,
      JSON.stringify(
        payloads.map(({ environment: _environment, ...payload }) => payload)
      ),
      signal
    );
  }

  /** Format a request for a platform-owned best-effort exit transport. */
  sendUnload(
    path: string,
    payloads: TPayload[],
    send: (
      request: { url: string; body: string } & Pick<
        RequestInit,
        'credentials' | 'referrerPolicy'
      >
    ) => void
  ): void {
    if (payloads.length > 0) {
      send({
        ...this._requestOptions,
        url: this._constructUrl(path),
        body: JSON.stringify(
          payloads.map(({ environment: _environment, ...payload }) => payload)
        ),
      });
    }
  }

  private async _sendWithFetchRetry(
    path: string,
    body: string,
    signal?: AbortSignal
  ): Promise<void> {
    const url = this._constructUrl(path);
    let lastError: unknown;

    const maxAttempts = this._config.maxHttpAttempts;
    const baseDelay = this._config.retryBaseDelayMs;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const waitMs = getRetryDelayMs(baseDelay, attempt - 1);
        await waitForRetry(waitMs, signal);
      }

      if (signal?.aborted) return;

      try {
        await this._sendOnceWithFetch(url, body, signal);
        return;
      } catch (error) {
        if (signal?.aborted) return;
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

  private async _sendOnceWithFetch(
    url: string,
    body: string,
    signal?: AbortSignal
  ): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this._config.requestTimeout
    );

    try {
      const response = await fetch(url, {
        ...this._requestOptions,
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
      signal?.removeEventListener('abort', abort);
    }
  }
}
