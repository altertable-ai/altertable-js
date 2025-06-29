import { createAltertableStorageKey } from './storage';

export const DEFAULT_BASE_URL = 'https://api.altertable.ai';
export const DEFAULT_ENVIRONMENT = 'production';
export const AUTO_CAPTURE_INTERVAL = 100;

export const STORAGE_KEY_SESSION_ID = createAltertableStorageKey('session-id');
export const STORAGE_KEY_VISITOR_ID = createAltertableStorageKey('visitor-id');
export const STORAGE_KEY_TEST = createAltertableStorageKey('check');
export const STORAGE_KEY_TRACKING_CONSENT =
  createAltertableStorageKey('tracking-consent');

export const PAGEVIEW_EVENT = '$pageview';
export const PROPERTY_URL = '$url';
export const PROPERTY_SESSION_ID = '$session_id';
export const PROPERTY_VISITOR_ID = '$visitor_id';
export const PROPERTY_VIEWPORT = '$viewport';
export const PROPERTY_REFERER = '$referer';
export const PROPERTY_RELEASE = '$release';
export const PROPERTY_LIB = '$lib';
export const PROPERTY_LIB_VERSION = '$lib_version';

export const TrackingConsent = {
  DENIED: 'denied',
  DISMISSED: 'dismissed',
  GRANTED: 'granted',
  PENDING: 'pending',
} as const;

export type TrackingConsentType =
  (typeof TrackingConsent)[keyof typeof TrackingConsent];
