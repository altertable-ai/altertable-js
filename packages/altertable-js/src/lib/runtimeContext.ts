import { safelyRunOnBrowser } from './safelyRunOnBrowser';
import { getViewport, PropertyViewport } from './viewport';

/**
 * Runtime context captured at event time.
 *
 * This is used for events that need browser state (URL, viewport, referrer)
 * prior to the library being initialized. It ensures that the event payload
 * reflects the correct time-sensitive data from when the user called the method,
 * not when the queue is flushed post-init.
 */
export type RuntimeContext = {
  timestamp: string;
  url: PropertyUrl;
  referrer: PropertyReferrer;
  viewport: PropertyViewport;
};
type PropertyReferrer = string | null;
type PropertyUrl = string | null;

export function captureRuntimeContext(): RuntimeContext {
  return {
    timestamp: new Date().toISOString(),
    url: safelyRunOnBrowser<PropertyUrl>(
      ({ window }) => window.location.href || null,
      () => null
    ),
    referrer: safelyRunOnBrowser<PropertyReferrer>(
      ({ window }) => window.document.referrer || null,
      () => null
    ),
    viewport: getViewport(),
  };
}
