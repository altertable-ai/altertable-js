import { createKeyBuilder } from './lib/keyBuilder';

const STORAGE_KEY_PREFIX = 'atbl';
export const keyBuilder = createKeyBuilder(STORAGE_KEY_PREFIX, '.');
export const STORAGE_KEY_TEST = keyBuilder('check');

export const PREFIX_SESSION_ID = 'session';
export const PREFIX_VISITOR_ID = 'visitor';

const MINUTE_IN_MS = 1_000 * 60;
export const AUTO_CAPTURE_INTERVAL_MS = 100;
export const SESSION_EXPIRATION_TIME_MS = 30 * MINUTE_IN_MS;
export const MAX_EVENT_QUEUE_SIZE = 1_000;
export const REQUEST_TIMEOUT_MS = 5_000;

export const EVENT_PAGEVIEW = '$pageview';

export const PROPERTY_LIB = '$lib';
export const PROPERTY_LIB_VERSION = '$lib_version';
export const PROPERTY_REFERER = '$referer';
export const PROPERTY_RELEASE = '$release';
export const PROPERTY_URL = '$url';
export const PROPERTY_VIEWPORT = '$viewport';

/**
 * Available tracking consent states.
 *
 * Use these constants to manage user consent for tracking and analytics.
 *
 * @property GRANTED User has granted consent for tracking
 * @property DENIED User has denied consent for tracking
 * @property PENDING User hasn't made a decision yet
 * @property DISMISSED User dismissed the consent prompt
 *
 * @example
 * ```javascript
 * import { altertable, TrackingConsent } from '@altertable/altertable-js';
 *
 * // Set tracking consent to granted
 * altertable.configure({
 *   trackingConsent: TrackingConsent.GRANTED,
 * });
 *
 * // Check current consent state
 * const consent = altertable.getTrackingConsent();
 * if (consent === TrackingConsent.GRANTED) {
 *   // Tracking is allowed
 * }
 * ```
 */
export const TrackingConsent = {
  DENIED: 'denied',
  DISMISSED: 'dismissed',
  GRANTED: 'granted',
  PENDING: 'pending',
} as const;

export type TrackingConsentType =
  (typeof TrackingConsent)[keyof typeof TrackingConsent];

export const RESERVED_USER_IDS = [
  'anonymous_id',
  'anonymous',
  'distinct_id',
  'distinctid',
  'false',
  'guest',
  'id',
  'not_authenticated',
  'true',
  'undefined',
  'user_id',
  'user',
  'visitor_id',
  'visitor',
];
export const RESERVED_USER_IDS_CASE_SENSITIVE = new Set([
  '[object Object]',
  '0',
  'NaN',
  'none',
  'None',
  'null',
]);
