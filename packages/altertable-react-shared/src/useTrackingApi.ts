import { mergeEventProperties } from '@altertable/altertable-shared';
import { useCallback, useMemo } from 'react';

import type {
  FunnelMapping,
  FunnelStepName,
  FunnelStepProperties,
  FunnelTracker,
} from './funnels';

/** The type-safe tracking methods shared by both `useAltertable()` hooks. */
export type TrackingApi<T extends FunnelMapping> = {
  /**
   * Type-safe track method for funnel steps.
   *
   * @template Steps The funnel steps type
   *
   * @example
   * ```typescript
   * const altertable = useAltertable<MyFunnels>();
   * altertable.track('Email Entered', { email: 'user@example.com' });
   * ```
   */
  track: <Steps extends T[keyof T] = T[keyof T]>(
    /** The name of the funnel step to track */
    eventName: FunnelStepName<Steps>,
    /** Properties associated with the step (type-checked based on step definition) */
    properties?: FunnelStepProperties<Steps, FunnelStepName<Steps>>
  ) => void;
  /**
   * Selects a specific funnel for type-safe step tracking.
   *
   * @template FunnelName The name of the funnel to select
   * @returns An object with a `trackStep` method for tracking steps in the selected funnel
   *
   * @example
   * ```typescript
   * const altertable = useAltertable<MyFunnels>();
   * const signupFunnel = altertable.selectFunnel('signup');
   * signupFunnel.trackStep('Email Entered', { email: 'user@example.com' });
   * ```
   */
  selectFunnel: <FunnelName extends keyof T>(
    /** The name of the funnel (used for type inference only) */
    funnelName: FunnelName
  ) => FunnelTracker<T[FunnelName]>;
};

/** The part of a client that the tracking API sends events through. */
type TrackingClient = {
  track(event: string, properties?: Record<string, unknown>): unknown;
};

/**
 * Returns the type-safe `track()` and `selectFunnel()` methods that both
 * `useAltertable()` hooks expose. Each package adds its own client methods.
 */
export function useTrackingApi<T extends FunnelMapping>(
  client: TrackingClient
): TrackingApi<T> {
  const track = useCallback<TrackingApi<T>['track']>(
    (eventName, properties) => {
      client.track(eventName, mergeEventProperties(properties));
    },
    [client]
  );

  const funnelTracker = useMemo(
    (): FunnelTracker<T[keyof T]> => ({
      trackStep: track<T[keyof T]>,
    }),
    [track]
  );

  const selectFunnel = useCallback<TrackingApi<T>['selectFunnel']>(
    <FunnelName extends keyof T>() =>
      funnelTracker as FunnelTracker<T[FunnelName]>,
    [funnelTracker]
  );

  return { track, selectFunnel };
}
