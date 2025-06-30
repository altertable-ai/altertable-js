export type EventPayload = {
  event: string;
  user_id: string | undefined;
  environment: string;
  properties: EventProperties;
};

export type EventProperties = Record<string, unknown>;
