export type EventPayload = {
  environment: string;
  event: string;
  properties: EventProperties;
  session_id: string;
  timestamp: string;
  user_id: string | null;
  visitor_id: string;
};

export type EventProperties = Record<string, unknown>;

export type UserId = string;
export type VisitorId = `visitor-${string}`;
export type SessionId = `session-${string}`;

export interface UserTraits extends Record<string, unknown> {
  email?: string;
}
