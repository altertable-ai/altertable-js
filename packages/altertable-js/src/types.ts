export type StringWithAutocomplete<T> = T | (string & {});

export type EventType = 'track' | 'identify' | 'alias';

export type EventProperties = Record<string, unknown>;

export type UserId = string;
export type DistinctId = StringWithAutocomplete<UserId | AnonymousId>;
export type DeviceId = `device-${string}`;
export type AnonymousId = `anonymous-${string}`;
export type SessionId = `session-${string}`;
export type Environment = StringWithAutocomplete<
  'production' | 'development' | 'staging'
>;

export interface UserTraits extends Record<string, unknown> {
  email?: string;
}

export type AltertableContext = {
  environment: Environment;
  device_id: DeviceId;
  distinct_id: DistinctId;
  anonymous_id: AnonymousId | null;
  session_id: SessionId;
};

export type EventPayload =
  TrackPayload | AdapterTrackPayload | IdentifyPayload | AliasPayload;

/** @internal Shared wire context for Altertable and adapter delivery. */
export type EventContext = {
  environment: Environment;
  distinct_id: string;
  device_id?: string;
  anonymous_id: string | null;
  session_id?: string;
};

/** @internal Normalized track payload received from an analytics adapter. */
export type AdapterTrackPayload = EventContext & {
  event: string;
  properties: EventProperties;
  timestamp: string;
};

export type TrackPayload = AltertableContext & {
  event: string;
  properties: EventProperties;
  timestamp: string;
};

/**
 * Transforms a fully constructed Altertable track event before it is queued or sent.
 * Return `null` to discard the event.
 */
export type TransformEvent = (event: TrackPayload) => TrackPayload | null;

export type IdentifyPayload = Omit<EventContext, 'session_id'> & {
  timestamp?: string;
  traits: UserTraits;
};

export type AliasPayload = Omit<EventContext, 'session_id'> & {
  timestamp?: string;
  new_user_id: DistinctId;
};
