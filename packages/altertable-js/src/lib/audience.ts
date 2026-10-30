import {
  PROPERTY_REFERER,
  PROPERTY_URL,
  PROPERTY_VIEWPORT,
} from '../constants';
import type { AudienceTrackPayload, TrackPayload } from '../types';

function sanitizeUrl(value: unknown, originOnly = false): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return originOnly ? url.origin : `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

/** Apply after caller transforms so identity and automatic context cannot leak back in. */
export function prepareAudienceEvent(
  payload: TrackPayload
): AudienceTrackPayload {
  const properties = { ...payload.properties };
  properties[PROPERTY_URL] = sanitizeUrl(properties[PROPERTY_URL]);
  properties[PROPERTY_REFERER] = sanitizeUrl(
    properties[PROPERTY_REFERER],
    true
  );
  delete properties[PROPERTY_VIEWPORT];
  return {
    processing_mode: 'audience',
    event: payload.event,
    timestamp: payload.timestamp,
    properties,
  };
}
