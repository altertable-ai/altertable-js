import { createKeyBuilder } from './lib/createKeyBuilder';

export const DEFAULT_BASE_URL = 'https://api.altertable.ai';
export const DEFAULT_ENVIRONMENT = 'production';

export const SESSION_STORAGE_KEY = 'altertable-session-id';
export const LOCAL_STORAGE_KEY = 'altertable-visitor-id';

const keyBuilder = createKeyBuilder('atbl', '.');
export const STORAGE_KEY_TEST = keyBuilder('check');
export const STORAGE_KEY_SESSION_ID = keyBuilder('session-id');
export const STORAGE_KEY_VISITOR_ID = keyBuilder('visitor-id');

export const AUTO_CAPTURE_INTERVAL = 100;

export const PAGEVIEW_EVENT = '$pageview';

export const PROPERTY_LIB = '$lib';
export const PROPERTY_LIB_VERSION = '$lib_version';
export const PROPERTY_REFERER = '$referer';
export const PROPERTY_RELEASE = '$release';
export const PROPERTY_SESSION_ID = '$session_id';
export const PROPERTY_URL = '$url';
export const PROPERTY_VIEWPORT = '$viewport';
export const PROPERTY_VISITOR_ID = '$visitor_id';
