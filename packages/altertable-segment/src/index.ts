import type {
  FunctionSettings,
  SegmentAliasEvent,
  SegmentContext,
  SegmentDeleteEvent,
  SegmentGroupEvent,
  SegmentIdentifyEvent,
  SegmentPageEvent,
  SegmentScreenEvent,
  SegmentTrackEvent,
} from './types';

/**
 * Skip 5xx errors
 */
const DEFAULT_SKIP_5XX_ERRORS = false;

/**
 * Default sampling rate (100% of events will be sent to Altertable)
 */
const DEFAULT_SAMPING_RATE = 1;

/**
 * Default Altertable API endpoint
 */
const DEFAULT_ENDPOINT = 'https://api.altertable.ai';

/**
 * Default Altertable environment
 */
const DEFAULT_ENVIRONMENT = 'production';

/**
 * Context mapping from Segment to Altertable format
 */
const contextMapping: Record<string, string> = {
  ip: '$ip',
  'page.url': '$current_url',
  'page.path': '$pathname',
  'page.referrer': '$referrer',
  'os.name': '$os',
  'screen.width': '$screen_width',
  'screen.height': '$screen_height',
  'device.type': '$device_type',
  'device.id': '$device_id',
  'device.model': '$device_model',
  userAgent: '$user_agent',
  locale: '$locale',
  timezone: '$timezone',
};

/**
 * Helper to get nested property value
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Parse and transform Segment context to Altertable properties
 */
function parseContext(context?: SegmentContext): Record<string, any> {
  if (!context) {
    return {};
  }

  const result: Record<string, any> = {};

  if (context.campaign) {
    Object.entries(context.campaign).forEach(([key, value]) => {
      const utmKey = key === 'name' ? 'utm_campaign' : `utm_${key}`;
      result[utmKey] = value;
    });
  }

  Object.entries(contextMapping).forEach(([segmentPath, altertableProp]) => {
    const value = getNestedValue(context, segmentPath);
    if (value !== undefined) {
      result[altertableProp] = value;
    }
  });

  if (context.library) {
    result.$lib = context.library.name || 'altertable-segment';
    if (context.library.version) {
      result.$lib_version = context.library.version;
    }
  } else {
    result.$lib = 'altertable-segment';
  }

  return result;
}

/**
 * Send event to Altertable API
 */
async function sendToAltertable(
  endpoint: string,
  apiKey: string,
  eventType: string,
  payload: Record<string, any>,
  settings: FunctionSettings
): Promise<Response | undefined> {
  const samplingRate = settings.samplingRate ?? DEFAULT_SAMPING_RATE;
  if (Math.random() > samplingRate) {
    return undefined;
  }

  const url = new URL(`${endpoint}/${eventType}`);
  url.searchParams.set('apiKey', apiKey);

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new RetryError((error as Error).message);
  }

  const skip5XXErrors = settings.skip5xxErrors ?? DEFAULT_SKIP_5XX_ERRORS;
  if (response.status / 100 === 5 && skip5XXErrors) {
    return undefined;
  }

  if (response.status / 100 !== 2) {
    throw new RetryError(
      `Failed with ${response.status}: ${await response.text()}`
    );
  }

  return response;
}

/**
 * Handle track event
 * @param event SegmentTrackEvent
 * @param settings FunctionSettings
 */
export async function onTrack(
  event: SegmentTrackEvent,
  settings: FunctionSettings
): Promise<void> {
  const endpoint = settings.endpoint || DEFAULT_ENDPOINT;
  const environment = settings.environment || DEFAULT_ENVIRONMENT;
  const contextProps = parseContext(event.context);

  const payload: Record<string, any> = {
    environment,
    event: event.event,
    properties: {
      ...contextProps,
      ...event.properties,
    },
    timestamp: event.timestamp,
    distinct_id: event.userId || event.anonymousId,
    device_id: event.context?.device?.id,
  };

  // Add anonymous_id if user is identified
  if (event.userId && event.anonymousId) {
    payload.anonymous_id = event.anonymousId;
  }

  await sendToAltertable(endpoint, settings.apiKey, 'track', payload, settings);
}

/**
 * Handle identify event
 * @param event SegmentIdentifyEvent
 * @param settings FunctionSettings
 */
export async function onIdentify(
  event: SegmentIdentifyEvent,
  settings: FunctionSettings
): Promise<void> {
  const endpoint = settings.endpoint || DEFAULT_ENDPOINT;
  const environment = settings.environment || DEFAULT_ENVIRONMENT;
  const contextProps = parseContext(event.context);

  const distinctId = event.userId || event.anonymousId;
  const anonymousId =
    event.userId && event.userId !== event.anonymousId
      ? event.anonymousId
      : undefined;

  const payload: Record<string, any> = {
    environment,
    traits: {
      ...event.traits,
    },
    timestamp: event.timestamp,
    distinct_id: distinctId,
    anonymous_id: anonymousId,
    device_id: event.context?.device?.id,
  };

  // Include context properties in traits
  Object.assign(payload.traits, contextProps);

  await sendToAltertable(
    endpoint,
    settings.apiKey,
    'identify',
    payload,
    settings
  );
}

/**
 * Handle alias event
 * @param event SegmentAliasEvent
 * @param settings FunctionSettings
 */
export async function onAlias(
  event: SegmentAliasEvent,
  settings: FunctionSettings
): Promise<void> {
  const endpoint = settings.endpoint || DEFAULT_ENDPOINT;
  const environment = settings.environment || DEFAULT_ENVIRONMENT;

  const payload = {
    environment,
    new_user_id: event.userId,
    timestamp: event.timestamp,
    distinct_id: event.previousId,
    device_id: event.context?.device?.id,
  };

  await sendToAltertable(endpoint, settings.apiKey, 'alias', payload, settings);
}

/**
 * Handle page event - converts to $pageview track event
 * @param event SegmentPageEvent
 * @param settings FunctionSettings
 */
export async function onPage(
  event: SegmentPageEvent,
  settings: FunctionSettings
): Promise<void> {
  const trackEvent: SegmentTrackEvent = {
    ...event,
    type: 'track',
    event: '$pageview',
    properties: {
      ...event.properties,
      $page_name: event.name,
      $page_category: event.category,
    },
  };

  await onTrack(trackEvent, settings);
}

/**
 * Handle screen event - converts to $screen track event
 * @param event SegmentScreenEvent
 * @param settings FunctionSettings
 */
export async function onScreen(
  event: SegmentScreenEvent,
  settings: FunctionSettings
): Promise<void> {
  const trackEvent: SegmentTrackEvent = {
    ...event,
    type: 'track',
    event: '$screen',
    properties: {
      ...event.properties,
      $screen_name: event.name,
      $screen_category: event.category,
    },
  };

  await onTrack(trackEvent, settings);
}

/**
 * Handle group event - NOT SUPPORTED
 * @param _event SegmentGroupEvent
 * @param _settings FunctionSettings
 */
export async function onGroup(
  _event: SegmentGroupEvent,
  _settings: FunctionSettings
): Promise<void> {
  throw new EventNotSupported('group is not supported');
}

/**
 * Handle delete event - NOT SUPPORTED
 * @param _event SegmentDeleteEvent
 * @param _settings FunctionSettings
 */
export async function onDelete(
  _event: SegmentDeleteEvent,
  _settings: FunctionSettings
): Promise<void> {
  throw new EventNotSupported('delete is not supported');
}
