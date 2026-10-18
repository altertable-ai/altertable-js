import type { EventProperties } from '../types';

/** Event-time values. Missing browser concepts remain null in other runtimes. */
export interface PlatformContext {
  url?: string | null;
  referrer?: string | null;
  viewport?: string | null;
  properties?: EventProperties;
}

/** `exit` requests synchronous best-effort delivery; `inactive` uses normal delivery. */
export type PlatformLifecycleEvent = 'active' | 'inactive' | 'online' | 'exit';

/** Runtime capabilities, fixed for the lifetime of a client. */
export interface Platform {
  /** Best-effort transport for runtimes that can deliver while exiting. */
  sendOnExit?(request: { url: string; body: string }): void;
  getContext(): PlatformContext;
  isOnline?(): boolean;
  subscribeLifecycle?(
    listener: (event: PlatformLifecycleEvent) => void
  ): () => void;
  /** Report subsequent URL changes; the core records the initial page separately. */
  subscribePageViews?(listener: (url: string) => void): () => void;
  /** Complete required persistence before normal delivery. Return false to defer delivery; rejection prevents sending. */
  prepareDelivery?(): Promise<void | boolean>;
}
