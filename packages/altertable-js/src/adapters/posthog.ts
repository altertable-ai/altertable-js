import { PROPERTY_REFERER, PROPERTY_URL } from '../constants';
import { isRecord } from '../lib/isRecord';
import type { Environment, EventContext, EventProperties } from '../types';
import type { AdapterIngress } from './subscription';
import type { AdapterEvent, PostHogAdapter, SourceMetadata } from './types';

/** Owns the single PostHog `eventCaptured` subscription. */
export class PostHogSubscription {
  private _instance: PostHogAdapter | undefined;
  private _unsubscribe: (() => void) | undefined;
  private _disposed = false;

  constructor(private _sink: AdapterIngress) {}

  update(next: PostHogAdapter | undefined) {
    if (this._disposed) {
      return;
    }
    if (next === this._instance) {
      return;
    }
    this._detach();
    if (next != null) {
      this._attach(next);
    }
  }

  dispose() {
    this._disposed = true;
    this._detach();
  }

  private _attach(instance: PostHogAdapter) {
    this._instance = instance;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = instance.on('eventCaptured', event =>
        this._forward(instance, event)
      );
    } catch (error) {
      this._instance = undefined;
      this._report(error);
      return;
    }
    if (this._disposed || this._instance !== instance) {
      this._unsubscribeFrom(unsubscribe);
      return;
    }
    this._unsubscribe = unsubscribe;
  }

  private _forward(instance: PostHogAdapter, event: unknown) {
    if (this._instance !== instance) {
      return;
    }
    try {
      for (const record of normalizePostHogEvent(
        event,
        this._sink.getEnvironment()
      )) {
        if (this._instance !== instance) {
          return;
        }
        this._sink.emit(record);
      }
    } catch (error) {
      this._report(error);
    }
  }

  private _detach() {
    const unsubscribe = this._unsubscribe;
    this._instance = undefined;
    this._unsubscribe = undefined;
    if (unsubscribe) {
      this._unsubscribeFrom(unsubscribe);
    }
  }

  private _unsubscribeFrom(unsubscribe: () => void) {
    try {
      unsubscribe();
    } catch (error) {
      this._report(error);
    }
  }

  private _report(error: unknown) {
    try {
      this._sink.onError(error);
    } catch {
      // Diagnostics must not interrupt the provider callback.
    }
  }
}

/** Normalize the captured snapshot, never the provider's mutable current state. */
export function normalizePostHogEvent(
  input: unknown,
  environment: Environment
): AdapterEvent[] {
  if (!isRecord(input) || typeof input.event !== 'string' || !input.event) {
    throw new Error('Invalid PostHog event.');
  }
  if (input.event === '$snapshot' || input.event === '$$heatmap') {
    return [];
  }
  if (!isRecord(input.properties)) {
    throw new Error('Missing PostHog event properties.');
  }
  if (
    input.properties.$cookieless_mode ||
    input.properties.distinct_id === '$posthog_cookieless'
  ) {
    throw new Error(
      'Cookieless PostHog events are not supported by Altertable.'
    );
  }
  const distinctId = nonBlankString(input.properties.distinct_id);
  if (!distinctId) {
    throw new Error('Missing PostHog event identity.');
  }
  const date =
    input.timestamp instanceof Date
      ? input.timestamp
      : typeof input.timestamp === 'string'
        ? new Date(input.timestamp)
        : undefined;
  if (!date || !Number.isFinite(date.getTime())) {
    throw new Error('Invalid PostHog event timestamp.');
  }
  if ('$altertable_source' in input.properties) {
    throw new Error('PostHog property $altertable_source is reserved.');
  }

  // The clone matches the wire format and isolates later provider mutations.
  const properties = normalizePostHogProperties(input);
  const source: SourceMetadata = {
    provider: 'posthog',
    event_id: nonBlankString(input.uuid),
    lib: __LIB__,
    lib_version: __LIB_VERSION__,
  };

  const context: PostHogEventContext = {
    environment,
    timestamp: date.toISOString(),
    distinct_id: distinctId,
    device_id: nonBlankString(properties.$device_id),
    anonymous_id: nonBlankString(properties.$anon_distinct_id) ?? null,
  };
  const events: AdapterEvent[] = [
    {
      type: 'track',
      source,
      payload: {
        ...context,
        session_id: nonBlankString(properties.$session_id),
        event: input.event,
        properties,
      },
    },
  ];

  // Keep set-once/group operations as source data; the API has no equivalent.
  if (input.event === '$identify' || input.event === '$set') {
    events.push({
      type: 'identify',
      payload: {
        ...context,
        traits: isRecord(properties.$set)
          ? cloneSerializable(properties.$set)
          : {},
      },
    });
  }
  if (input.event === '$create_alias') {
    const alias = nonBlankString(properties.alias);
    if (!alias) {
      throw new Error('Missing PostHog alias identity.');
    }
    events.push({
      type: 'alias',
      payload: { ...context, new_user_id: alias },
    });
  }
  return events;
}

function normalizePostHogProperties(
  input: Record<string, unknown>
): EventProperties {
  const properties = cloneSerializable(input.properties) as EventProperties;
  delete properties.token;

  for (const key of ['$set', '$set_once']) {
    if (!isRecord(input[key])) {
      continue;
    }
    properties[key] = {
      ...(isRecord(properties[key]) ? properties[key] : {}),
      ...cloneSerializable(input[key]),
    };
  }
  for (const [postHogKey, altertableKey] of Object.entries(
    POSTHOG_PROPERTY_ALIASES
  )) {
    if (
      properties[postHogKey] !== undefined &&
      properties[altertableKey] === undefined
    ) {
      properties[altertableKey] = properties[postHogKey];
    }
  }
  return properties;
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function nonBlankString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return undefined;
}

const POSTHOG_PROPERTY_ALIASES = {
  $current_url: PROPERTY_URL,
  $referrer: PROPERTY_REFERER,
  utm_source: '$utm_source',
  utm_medium: '$utm_medium',
  utm_campaign: '$utm_campaign',
  utm_content: '$utm_content',
  utm_term: '$utm_term',
} as const;

type PostHogEventContext = Omit<EventContext, 'session_id'> & {
  timestamp: string;
};
