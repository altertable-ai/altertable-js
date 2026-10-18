import type { EventProperties } from '../types';

export type PropertyUrl = string | null;
export type PropertyReferrer = string | null;
export type PropertyViewport = string | null;

/** Event-time values. Missing browser concepts remain null in other runtimes. */
export interface PlatformContext {
  url?: PropertyUrl;
  referrer?: PropertyReferrer;
  viewport?: PropertyViewport;
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
  /**
   * Report URL changes after subscription; return a function that unsubscribes.
   * The core records the initial URL and turns changes into page views when
   * autoCapture is enabled. Runtimes without URLs can omit this capability.
   */
  subscribeUrlChanges?(listener: (url: string) => void): () => void;
  /**
   * Await prerequisites, such as durable writes, before each normal delivery
   * snapshot. Events are selected before this hook runs and remain buffered
   * until it succeeds; later arrivals require another prepared snapshot. This
   * does not run before each HTTP retry or for sendOnExit delivery.
   * Resolve with true or undefined to proceed, or false to leave events buffered
   * until a later trigger. Rejection also leaves events buffered: automatic
   * attempts report it through onError, and explicit flush calls reject.
   */
  prepareDelivery?(): Promise<void | boolean>;
}
