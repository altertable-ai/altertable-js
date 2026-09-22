import type {
  AdapterTrackPayload,
  AliasPayload,
  IdentifyPayload,
} from '../types';

/** The public PostHog capability used by Altertable; no runtime SDK dependency. */
export interface PostHogAdapter {
  on(event: 'eventCaptured', callback: (event: unknown) => void): () => void;
}

export interface AdapterInstances {
  posthog: PostHogAdapter;
}

export type Adapters = Partial<AdapterInstances>;

/** Private track provenance in the existing backend format. */
export type SourceMetadata = {
  readonly provider: keyof AdapterInstances;
  readonly event_id?: string;
  readonly lib: string;
  readonly lib_version: string;
};

/** Provider adapters emit Altertable records without changing native client state. */
export type AdapterEvent =
  | {
      type: 'track';
      payload: AdapterTrackPayload;
      readonly source: SourceMetadata;
    }
  | { type: 'identify'; payload: IdentifyPayload & { timestamp: string } }
  | { type: 'alias'; payload: AliasPayload & { timestamp: string } };
