import { createLogger } from './logger';
import type { EventPayload, IdentifyPayload } from '../types';
import { generateId } from './generateId';

export interface NetworkManagerConfig {
  /**
   * Base URL for API requests
   */
  baseUrl: string;
  /**
   * API key for authentication
   */
  apiKey: string;
  /**
   * Maximum number of retry attempts for failed requests
   * @default 3
   */
  maxRetries: number;
  /**
   * Timeout for HTTP requests in milliseconds
   * @default 10000
   */
  requestTimeout: number;
  /**
   * Maximum number of events to queue
   * @default 100
   */
  maxQueueSize: number;
  /**
   * Delay before flushing batch in milliseconds
   * @default 100
   */
  batchDelay: number;
  /**
   * Maximum number of events per batch
   * @default 10
   */
  maxBatchSize: number;
}

export interface QueuedEvent {
  id: string;
  path: string;
  payload: EventPayload | IdentifyPayload;
  timestamp: number;
  retryCount: number;
}

export class NetworkManager {
  private _queue: QueuedEvent[] = [];
  private _batchTimeout: NodeJS.Timeout | null = null;
  private _isProcessing = false;
  private _isOnline = true;
  private _logger = createLogger('NetworkManager');
  private _onlineHandler: (() => void) | undefined;
  private _offlineHandler: (() => void) | undefined;

  private readonly _config: Required<NetworkManagerConfig>;

  constructor(config: NetworkManagerConfig) {
    this._config = config;

    this._setupOnlineDetection();
  }

  /**
   * Adds an event to the queue and schedules processing
   */
  enqueue(path: string, payload: EventPayload | IdentifyPayload): void {
    const event: QueuedEvent = {
      id: this._generateId(),
      path,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    };

    // Check queue size limit
    if (this._queue.length >= this._config.maxQueueSize) {
      this._logger.warn(
        `Queue full (${this._config.maxQueueSize} events), dropping oldest event`
      );
      this._queue.shift(); // Remove oldest event
    }

    this._queue.push(event);
    this._scheduleProcessing();
  }

  /**
   * Gets the current queue size
   */
  getQueueSize(): number {
    return this._queue.length;
  }

  /**
   * Gets the current queue status
   */
  getStatus(): {
    queueSize: number;
    isProcessing: boolean;
    maxQueueSize: number;
    isOnline: boolean;
  } {
    return {
      queueSize: this._queue.length,
      isProcessing: this._isProcessing,
      maxQueueSize: this._config.maxQueueSize,
      isOnline: this._isOnline,
    };
  }

  /**
   * Gets the current online status
   */
  isOnline(): boolean {
    return this._isOnline;
  }

  /**
   * Manually flushes the queue (useful for testing or immediate sending)
   */
  async flush(): Promise<void> {
    this._clearBatchTimeout();
    await this._processQueue();
  }

  /**
   * Clears all events from the queue
   */
  clear(): void {
    this._clearBatchTimeout();
    this._queue = [];
    this._logger.log('Queue cleared');
  }

  /**
   * Destroys the network manager and cleans up event listeners
   */
  destroy(): void {
    this._clearBatchTimeout();
    this._queue = [];

    // Remove event listeners
    if (
      typeof window !== 'undefined' &&
      this._onlineHandler &&
      this._offlineHandler
    ) {
      window.removeEventListener('online', this._onlineHandler);
      window.removeEventListener('offline', this._offlineHandler);
      this._onlineHandler = undefined;
      this._offlineHandler = undefined;
    }

    this._logger.log('NetworkManager destroyed');
  }

  private _setupOnlineDetection(): void {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      // Set initial online status
      this._isOnline = navigator.onLine;

      // Create bound event handlers
      this._onlineHandler = this._handleOnline.bind(this);
      this._offlineHandler = this._handleOffline.bind(this);

      // Listen for online/offline events
      window.addEventListener('online', this._onlineHandler);
      window.addEventListener('offline', this._offlineHandler);
    }
  }

  private _handleOnline(): void {
    if (!this._isOnline) {
      this._isOnline = true;
      this._logger.log('Network connection restored');

      // Process any queued events when coming back online
      if (this._queue.length > 0) {
        this._scheduleProcessing();
      }
    }
  }

  private _handleOffline(): void {
    if (this._isOnline) {
      this._isOnline = false;
      this._logger.warn('Network connection lost, events will be queued');
    }
  }

  private _scheduleProcessing(): void {
    if (this._batchTimeout) {
      return; // Already scheduled
    }

    // Only schedule processing if we're online
    if (!this._isOnline) {
      this._logger.log('Skipping queue processing - offline');
      return;
    }

    this._batchTimeout = setTimeout(() => {
      this._batchTimeout = null;
      this._processQueue();
    }, this._config.batchDelay);
  }

  private async _processQueue(): Promise<void> {
    if (this._isProcessing || this._queue.length === 0) {
      return;
    }

    // Don't process if we're offline
    if (!this._isOnline) {
      this._logger.log('Skipping queue processing - offline');
      return;
    }

    this._isProcessing = true;

    try {
      // Process events in batches
      while (this._queue.length > 0 && this._isOnline) {
        const batch = this._queue.splice(0, this._config.maxBatchSize);
        await this._sendBatch(batch);
      }
    } catch (error) {
      this._logger.error('Failed to process queue:', error);
    } finally {
      this._isProcessing = false;

      // If new events were added while processing and we're still online, schedule another run
      if (this._queue.length > 0 && this._isOnline) {
        this._scheduleProcessing();
      }
    }
  }

  private async _sendBatch(batch: QueuedEvent[]): Promise<void> {
    if (batch.length === 1) {
      // Single event - send directly
      await this._sendSingleEvent(batch[0]);
    } else {
      // Multiple events - send as batch
      await this._sendBatchRequest(batch);
    }
  }

  private async _sendSingleEvent(event: QueuedEvent): Promise<void> {
    try {
      await this._makeRequest(event.path, event.payload);
      this._logger.log(`Event sent successfully: ${event.id}`);
    } catch (error) {
      await this._handleRequestError(event, error);
    }
  }

  private async _sendBatchRequest(batch: QueuedEvent[]): Promise<void> {
    const batchPayload = {
      events: batch.map(event => ({
        id: event.id,
        path: event.path,
        payload: event.payload,
      })),
    };

    try {
      await this._makeRequest('/batch', batchPayload);
      this._logger.log(`Batch sent successfully: ${batch.length} events`);
    } catch (error) {
      // If batch fails, retry individual events
      this._logger.warn(
        `Batch request failed, retrying individual events: ${error.message}`
      );
      for (const event of batch) {
        await this._handleRequestError(event, error);
      }
    }
  }

  private async _handleRequestError(
    event: QueuedEvent,
    error: unknown
  ): Promise<void> {
    if (event.retryCount < this._config.maxRetries) {
      // Retry the event
      event.retryCount++;
      event.timestamp = Date.now();

      // Add back to queue with exponential backoff
      const backoffDelay = Math.min(
        1000 * Math.pow(2, event.retryCount - 1),
        30000
      );
      setTimeout(() => {
        this._queue.unshift(event); // Add to front of queue
        this._scheduleProcessing();
      }, backoffDelay);

      this._logger.warn(
        `Event ${event.id} failed, retrying (${event.retryCount}/${this._config.maxRetries}): ${error}`
      );
    } else {
      // Max retries exceeded, drop the event
      this._logger.error(
        `Event ${event.id} failed after ${this._config.maxRetries} retries, dropping: ${error}`
      );
    }
  }

  private async _makeRequest(path: string, payload: unknown): Promise<void> {
    const url = `${this._config.baseUrl}${path}?apiKey=${encodeURIComponent(this._config.apiKey)}`;
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
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private _clearBatchTimeout(): void {
    if (this._batchTimeout) {
      clearTimeout(this._batchTimeout);
      this._batchTimeout = null;
    }
  }

  private _generateId(): string {
    return generateId('event');
  }
}
