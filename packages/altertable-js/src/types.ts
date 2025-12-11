export type StringWithAutocomplete<T> = T | (string & {});

export type EventType = 'track' | 'identify' | 'alias';

export type EventProperties = Record<string, unknown>;

export type UserId = string;
export type DistinctId = StringWithAutocomplete<UserId | VisitorId>;
export type DeviceId = `device-${string}`;
export type VisitorId = `visitor-${string}`;
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
  anonymous_id: VisitorId;
  session_id: SessionId;
};

export type EventPayload = TrackPayload | IdentifyPayload | AliasPayload;

export type TrackPayload = AltertableContext & {
  event: string;
  properties: EventProperties;
  timestamp: string;
};

export type IdentifyPayload = Omit<AltertableContext, 'session_id'> & {
  traits: UserTraits;
};

export type AliasPayload = Omit<AltertableContext, 'session_id'> & {
  new_user_id: DistinctId;
};
