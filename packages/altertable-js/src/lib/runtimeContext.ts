import type { Platform } from '../platform/types';

/**
 * Runtime context captured at event time.
 *
 * This snapshots platform context and metadata for events recorded
 * prior to the library being initialized. It ensures that the event payload
 * reflects the correct time-sensitive data from when the user called the method,
 * not when the queue is flushed post-init.
 */
export type RuntimeContext = {
  timestamp: string;
  url: string | null;
  referrer: string | null;
  viewport: string | null;
  properties: Record<string, unknown>;
};

export function captureRuntimeContext(platform: Platform): RuntimeContext {
  const context = platform.getContext();
  return {
    timestamp: new Date().toISOString(),
    url: context.url ?? null,
    referrer: context.referrer ?? null,
    viewport: context.viewport ?? null,
    properties: { ...context.properties },
  };
}
