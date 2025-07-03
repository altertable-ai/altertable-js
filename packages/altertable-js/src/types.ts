export type EventType = 'track' | 'identify';

export type EventProperties = Record<string, unknown>;

export type UserId = string;
export type VisitorId = `visitor-${string}`;
export type SessionId = `session-${string}`;

export interface UserTraits extends Record<string, unknown> {
  email?: string;
}

export type EventContext = {
  environment: string;
  user_id: UserId | null;
  visitor_id: VisitorId;
  session_id: SessionId;
};

export type EventPayload = EventContext & {
  event: string;
  properties: EventProperties;
  timestamp: string;
};

export type IdentifyPayload = Omit<EventContext, 'session_id'> & {
  traits: UserTraits;
};
