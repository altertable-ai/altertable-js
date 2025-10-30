export type StringWithAutocomplete<T> = T | (string & {});

export type EventType = 'track' | 'identify';

export type EventProperties = Record<string, unknown>;

export type UserId = string;
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
  user_id: UserId | null;
  visitor_id: VisitorId;
  session_id: SessionId;
};

export type EventPayload = TrackPayload | IdentifyPayload;

export type TrackPayload = AltertableContext & {
  event: string;
  properties: EventProperties;
  timestamp: string;
};

export type IdentifyPayload = Omit<AltertableContext, 'session_id'> & {
  traits: UserTraits;
};
