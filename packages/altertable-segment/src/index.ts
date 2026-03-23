import type {
  FunctionSettings,
  SegmentAliasEvent,
  SegmentAnyEvent,
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
  'page.url': '$url',
  'page.referrer': '$referer',
  'os.name': '$os',
  userAgent: '$user_agent',
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
function parseContext(
  context?: SegmentContext,
  channel?: string
): Record<string, any> {
  if (!context) {
    return {};
  }

  const result: Record<string, any> = {};

  // Special handling for campaign data
  if (context.campaign) {
    Object.entries(context.campaign).forEach(([key, value]) => {
      const utmKey = (k => {
        switch (k) {
          case 'name':
          case 'campaign':
            return '$utm_campaign';
          case 'source':
          case 'term':
          case 'content':
          case 'medium':
            return `$utm_${k}`;
          default:
            return `utm_${k}`;
        }
      })(key);
      result[utmKey] = value;
    });
  }

  // Map known context properties to Altertable properties
  Object.entries(contextMapping).forEach(([segmentPath, altertableProp]) => {
    const value = getNestedValue(context, segmentPath);
    if (value !== undefined) {
      result[altertableProp] = value;
    }
  });

  // When channel is "server", we explicitly set $ip to 0 to tell the backend to not use the request IP
  if (channel === 'server' && !('$ip' in result)) {
    result['$ip'] = 0;
  }

  // Special handling for screen size
  const screenWidth = context.screen?.width;
  const screenHeight = context.screen?.height;
  if (screenWidth && screenHeight) {
    result['$viewport'] = `${screenWidth}x${screenHeight}`;
  }

  // Special handling for library data
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
  eventType: string,
  payload: Record<string, any> | Record<string, any>[],
  settings: FunctionSettings
): Promise<Response | undefined> {
  const samplingRate = settings.samplingRate ?? DEFAULT_SAMPING_RATE;
  if (Math.random() > samplingRate) {
    return undefined;
  }

  const url = new URL(`${settings.endpoint || DEFAULT_ENDPOINT}/${eventType}`);
  url.searchParams.set('apiKey', settings.apiKey);

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

function buildTrackPayload(
  event: SegmentTrackEvent,
  settings: FunctionSettings
): Record<string, any> {
  const environment = settings.environment || DEFAULT_ENVIRONMENT;
  const contextProps = parseContext(event.context, event.channel);

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

  return payload;
}

function buildIdentifyPayload(
  event: SegmentIdentifyEvent,
  settings: FunctionSettings
): Record<string, any> {
  const environment = settings.environment || DEFAULT_ENVIRONMENT;
  const contextProps = parseContext(event.context, event.channel);

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

  return payload;
}

function buildAliasPayload(
  event: SegmentAliasEvent,
  settings: FunctionSettings
): Record<string, any> {
  const environment = settings.environment || DEFAULT_ENVIRONMENT;

  const payload = {
    environment,
    new_user_id: event.userId,
    timestamp: event.timestamp,
    distinct_id: event.previousId,
    device_id: event.context?.device?.id,
  };

  return payload;
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
  await sendToAltertable('track', buildTrackPayload(event, settings), settings);
}

function batchTrack(
  events: SegmentTrackEvent[],
  settings: FunctionSettings
): Promise<Response | undefined> {
  return sendToAltertable(
    'track',
    events.map(event => buildTrackPayload(event, settings)),
    settings
  );
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
  await sendToAltertable(
    'identify',
    buildIdentifyPayload(event, settings),
    settings
  );
}

/**
 * Handle identify event batch
 * @param events SegmentIdentifyEvent[]
 * @param settings FunctionSettings
 */
function batchIdentify(
  events: SegmentIdentifyEvent[],
  settings: FunctionSettings
): Promise<Response | undefined> {
  return sendToAltertable(
    'identify',
    events.map(event => buildIdentifyPayload(event, settings)),
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
  await sendToAltertable('alias', buildAliasPayload(event, settings), settings);
}

/**
 * Handle alias event batch
 * @param events SegmentAliasEvent[]
 * @param settings FunctionSettings
 */
function batchAlias(
  events: SegmentAliasEvent[],
  settings: FunctionSettings
): Promise<Response | undefined> {
  return sendToAltertable(
    'alias',
    events.map(event => buildAliasPayload(event, settings)),
    settings
  );
}

/**
 * Convert page event to track event
 * @param event SegmentPageEvent
 * @returns SegmentTrackEvent
 */
function convertPageEventToTrackEvent(
  event: SegmentPageEvent
): SegmentTrackEvent {
  return {
    ...event,
    type: 'track',
    event: '$pageview',
  };
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
  await onTrack(convertPageEventToTrackEvent(event), settings);
}

/**
 * Convert screen event to track event
 * @param event SegmentScreenEvent
 * @returns SegmentTrackEvent
 */
function convertScreenEventToTrackEvent(
  event: SegmentScreenEvent
): SegmentTrackEvent {
  return {
    ...event,
    type: 'track',
    event: '$screen',
  };
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
  await onTrack(convertScreenEventToTrackEvent(event), settings);
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

/**
 * Handle batch event
 * @param events SegmentEvent[]
 * @param settings FunctionSettings
 */
export async function onBatch(
  events: SegmentAnyEvent[],
  settings: FunctionSettings
): Promise<void> {
  const eventsByType: Record<
    'track' | 'identify' | 'alias',
    SegmentAnyEvent[]
  > = {
    track: [],
    identify: [],
    alias: [],
  };
  for (const event of events) {
    let type: 'track' | 'identify' | 'alias';
    let payload: SegmentAnyEvent;
    switch (event.type) {
      case 'page':
        type = 'track';
        payload = convertPageEventToTrackEvent(event);
        break;
      case 'screen':
        type = 'track';
        payload = convertScreenEventToTrackEvent(event);
        break;
      case 'identify':
      case 'alias':
      case 'track':
        type = event.type;
        payload = event;
        break;
      default:
        throw new EventNotSupported(
          `event type ${event.type} is not supported`
        );
    }
    eventsByType[type].push(payload);
  }

  const promises = Object.entries(eventsByType).map(([type, payloads]) => {
    if (payloads.length === 0) {
      return Promise.resolve(undefined);
    }
    switch (type) {
      case 'track':
        return batchTrack(payloads as SegmentTrackEvent[], settings);
      case 'identify':
        return batchIdentify(payloads as SegmentIdentifyEvent[], settings);
      case 'alias':
        return batchAlias(payloads as SegmentAliasEvent[], settings);
      default:
        throw new EventNotSupported(`event type ${type} is not supported`);
    }
  });

  await Promise.all(promises);
}
