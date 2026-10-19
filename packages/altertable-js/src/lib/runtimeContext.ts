import type {
  Platform,
  PropertyUrl,
  PropertyReferrer,
  PropertyViewport,
} from '../platform/types';
import type { EventProperties } from '../types';

/** Event-time context, retained when calls are queued before initialization. */
export type RuntimeContext = {
  timestamp: string;
  url: PropertyUrl;
  referrer: PropertyReferrer;
  viewport: PropertyViewport;
  properties: EventProperties;
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
