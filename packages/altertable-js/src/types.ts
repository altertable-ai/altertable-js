export type EventPayload = {
  timestamp: string;
  event: string;
  user_id: string | undefined;
  environment: string;
  properties: EventProperties;
};

export type EventProperties = Record<string, unknown>;
