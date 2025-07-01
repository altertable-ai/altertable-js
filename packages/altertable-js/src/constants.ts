import { createKeyBuilder } from './lib/createKeyBuilder';

export const DEFAULT_BASE_URL = 'https://api.altertable.ai';
export const DEFAULT_ENVIRONMENT = 'production';
export const DEFAULT_PERSISTENCE = 'localStorage+cookie';

const keyBuilder = createKeyBuilder('atbl', '.');
export const STORAGE_KEY_TEST = keyBuilder('check');
export const STORAGE_KEY_SESSION_ID = keyBuilder('session-id');
export const STORAGE_KEY_ANONYMOUS_ID = keyBuilder('anonymous-id');
export const STORAGE_KEY_USER_ID = keyBuilder('user-id');

export const PREFIX_ANONYMOUS_ID = 'user';
export const PREFIX_SESSION_ID = 'session';

export const AUTO_CAPTURE_INTERVAL = 100;

export const PAGEVIEW_EVENT = '$pageview';

export const PROPERTY_ANONYMOUS_ID = '$anonymous_id';
export const PROPERTY_LIB = '$lib';
export const PROPERTY_LIB_VERSION = '$lib_version';
export const PROPERTY_REFERER = '$referer';
export const PROPERTY_RELEASE = '$release';
export const PROPERTY_SESSION_ID = '$session_id';
export const PROPERTY_URL = '$url';
export const PROPERTY_USER_ID = '$user_id';
export const PROPERTY_VIEWPORT = '$viewport';
export const PROPERTY_VISITOR_ID = '$visitor_id'; // TODO: rename to $user_id
