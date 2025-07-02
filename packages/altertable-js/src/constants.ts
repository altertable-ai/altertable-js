import { createKeyBuilder } from './lib/createKeyBuilder';

export const DEFAULT_BASE_URL = 'https://api.altertable.ai';
export const DEFAULT_ENVIRONMENT = 'production';
export const DEFAULT_PERSISTENCE = 'localStorage+cookie';
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_REQUEST_TIMEOUT = 10000;
export const DEFAULT_MAX_QUEUE_SIZE = 100;
export const DEFAULT_BATCH_DELAY = 100;
export const DEFAULT_MAX_BATCH_SIZE = 10;

const STORAGE_KEY_PREFIX = 'atbl';
const keyBuilder = createKeyBuilder(STORAGE_KEY_PREFIX, '.');
export const STORAGE_KEY_TEST = keyBuilder('check');
export const STORAGE_KEY = STORAGE_KEY_PREFIX;

export const PREFIX_SESSION_ID = 'session';
export const PREFIX_VISITOR_ID = 'visitor';

const MINUTE_IN_MS = 1000 * 60;
export const AUTO_CAPTURE_INTERVAL_MS = 100;
export const SESSION_EXPIRATION_TIME_MS = 30 * MINUTE_IN_MS;

export const EVENT_PAGEVIEW = '$pageview';

export const PROPERTY_LIB = '$lib';
export const PROPERTY_LIB_VERSION = '$lib_version';
export const PROPERTY_REFERER = '$referer';
export const PROPERTY_RELEASE = '$release';
export const PROPERTY_URL = '$url';
export const PROPERTY_VIEWPORT = '$viewport';

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
