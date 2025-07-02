export type EventPayload = {
  environment: string;
  event: string;
  properties: EventProperties;
  session_id: SessionId;
  timestamp: string;
  user_id: UserId | null;
  visitor_id: VisitorId;
};

export type IdentifyPayload = {
  environment: string;
  traits: UserTraits;
  user_id: UserId;
  visitor_id: VisitorId;
};

export type EventProperties = Record<string, unknown>;

export type UserId = string;
export type VisitorId = `visitor-${string}`;
export type SessionId = `session-${string}`;

export interface UserTraits extends Record<string, unknown> {
  email?: string;
}
