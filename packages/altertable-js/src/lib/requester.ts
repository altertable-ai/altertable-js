import { createLogger } from './logger';

export interface RequesterConfig {
  /**
   * Base URL for API requests
   */
  baseUrl: string;
  /**
   * API key for authentication
   */
  apiKey: string;
  /**
   * Timeout for HTTP requests in milliseconds
   * @default 10000
   */
  requestTimeout: number;
}

export interface RequestOptions {
  /**
   * Whether to use sendBeacon if available
   * @default true
   */
  preferBeacon?: boolean;
  /**
   * Whether to use keepalive for fetch requests
   * @default true
   */
  keepalive?: boolean;
}

export class Requester {
  private readonly _config: Required<RequesterConfig>;
  private readonly _logger = createLogger('Requester');

  constructor(config: RequesterConfig) {
    this._config = {
      requestTimeout: 10000,
      ...config,
    };
  }

  /**
   * Sends a request using the best available method
   */
  async send(
    path: string,
    payload: unknown,
    options: RequestOptions = {}
  ): Promise<void> {
    const { preferBeacon = true, keepalive = true } = options;

    // Use sendBeacon if preferred and available
    if (preferBeacon && this._isBeaconCapable()) {
      this._sendWithBeacon(path, payload);
      return;
    }

    // Fallback to fetch
    await this._sendWithFetch(path, payload, keepalive);
  }

  /**
   * Checks if sendBeacon is available in the current environment
   */
  private _isBeaconCapable(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    );
  }

  /**
   * Sends a request using navigator.sendBeacon
   */
  private _sendWithBeacon(path: string, payload: unknown): void {
    const url = `${this._config.baseUrl}${path}?apiKey=${encodeURIComponent(
      this._config.apiKey
    )}`;
    const data = new Blob([JSON.stringify(payload)], {
      type: 'application/json',
    });

    try {
      // @ts-ignore - sendBeacon exists in modern browsers
      const success = navigator.sendBeacon(url, data);
      if (!success) {
        this._logger.warn('sendBeacon failed, falling back to fetch');
        // Fallback to fetch if sendBeacon fails
        this._sendWithFetch(path, payload, true).catch(error => {
          this._logger.error('Fetch fallback also failed:', error);
        });
      }
    } catch (error) {
      this._logger.warn(
        'sendBeacon threw error, falling back to fetch:',
        error
      );
      // Fallback to fetch if sendBeacon throws
      this._sendWithFetch(path, payload, true).catch(fetchError => {
        this._logger.error('Fetch fallback also failed:', fetchError);
      });
    }
  }

  /**
   * Sends a request using fetch
   */
  private async _sendWithFetch(
    path: string,
    payload: unknown,
    keepalive: boolean
  ): Promise<void> {
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
        keepalive,
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

  /**
   * Gets the current configuration
   */
  getConfig(): RequesterConfig {
    return { ...this._config };
  }

  /**
   * Updates the configuration
   */
  updateConfig(updates: Partial<RequesterConfig>): void {
    Object.assign(this._config, updates);
  }
}
