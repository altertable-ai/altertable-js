/**
 * Segment event context information
 */
export interface SegmentContext {
  ip?: string;
  locale?: string;
  page?: {
    url?: string;
    path?: string;
    referrer?: string;
    title?: string;
    search?: string;
  };
  userAgent?: string;
  library?: {
    name?: string;
    version?: string;
  };
  os?: {
    name?: string;
    version?: string;
  };
  screen?: {
    width?: number;
    height?: number;
    density?: number;
  };
  device?: {
    type?: string;
    id?: string;
    manufacturer?: string;
    model?: string;
    name?: string;
  };
  campaign?: {
    name?: string;
    source?: string;
    medium?: string;
    term?: string;
    content?: string;
  };
  timezone?: string;
  groupId?: string;
  [key: string]: any;
}

/**
 * Base interface for all Segment events
 */
export interface SegmentEventBase {
  messageId: string;
  timestamp: string;
  anonymousId?: string;
  userId?: string;
  context?: SegmentContext;
  integrations?: Record<string, any>;
  properties?: Record<string, any>;
}

/**
 * Segment track event
 */
export interface SegmentTrackEvent extends SegmentEventBase {
  type: 'track';
  event: string;
  properties?: Record<string, any>;
}

/**
 * Segment identify event
 */
export interface SegmentIdentifyEvent extends SegmentEventBase {
  type: 'identify';
  traits?: Record<string, any>;
}

/**
 * Segment alias event
 */
export interface SegmentAliasEvent extends SegmentEventBase {
  type: 'alias';
  previousId: string;
}

/**
 * Segment page event
 */
export interface SegmentPageEvent extends SegmentEventBase {
  type: 'page';
  name?: string;
  category?: string;
  properties?: Record<string, any>;
}

/**
 * Segment screen event
 */
export interface SegmentScreenEvent extends SegmentEventBase {
  type: 'screen';
  name?: string;
  category?: string;
  properties?: Record<string, any>;
}

/**
 * Segment group event
 */
export interface SegmentGroupEvent extends SegmentEventBase {
  type: 'group';
  groupId: string;
  traits?: Record<string, any>;
}

/**
 * Segment delete event
 */
export interface SegmentDeleteEvent extends SegmentEventBase {
  type: 'delete';
}

/**
 * Settings passed from Segment
 */
export interface FunctionSettings {
  apiKey: string;
  endpoint?: string;
  [key: string]: any;
}

/**
 * Custom error types
 */
export class RetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryError';
  }
}

export class EventNotSupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventNotSupported';
  }
}
