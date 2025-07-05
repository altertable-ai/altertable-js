import { createKeyBuilder } from './lib/createKeyBuilder';

export const DEFAULT_BASE_URL = 'https://api.altertable.ai';
export const DEFAULT_ENVIRONMENT = 'production';
export const DEFAULT_PERSISTENCE = 'localStorage+cookie';
export const DEFAULT_REQUEST_TIMEOUT = 10000;

const STORAGE_KEY_PREFIX = 'atbl';
export const keyBuilder = createKeyBuilder(STORAGE_KEY_PREFIX, '.');
export const STORAGE_KEY_TEST = keyBuilder('check');

export const PREFIX_SESSION_ID = 'session';
export const PREFIX_VISITOR_ID = 'visitor';

const MINUTE_IN_MS = 1000 * 60;
export const AUTO_CAPTURE_INTERVAL_MS = 100;
export const SESSION_EXPIRATION_TIME_MS = 30 * MINUTE_IN_MS;
export const MAX_EVENT_QUEUE_SIZE = 1000;

export const EVENT_PAGEVIEW = '$pageview';

export const PROPERTY_LIB = '$lib';
export const PROPERTY_LIB_VERSION = '$lib_version';
export const PROPERTY_REFERER = '$referer';
export const PROPERTY_RELEASE = '$release';
export const PROPERTY_URL = '$url';
export const PROPERTY_VIEWPORT = '$viewport';

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
