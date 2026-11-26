import { mergeEventProperties } from '@altertable/altertable-shared';
import { useCallback, useMemo } from 'react';

import type {
  FunnelMapping,
  FunnelStepName,
  FunnelStepProperties,
  FunnelTracker,
} from './funnels';

/** The part of a client that the tracking API sends events through. */
type TrackingClient = {
  track(event: string, properties?: Record<string, unknown>): unknown;
};

/** The type-safe tracking methods shared by both `useAltertable()` hooks. */
export type TrackingApi<T extends FunnelMapping> = {
  track: <Steps extends T[keyof T] = T[keyof T]>(
    eventName: FunnelStepName<Steps>,
    properties?: FunnelStepProperties<Steps, FunnelStepName<Steps>>
  ) => void;
  selectFunnel: <FunnelName extends keyof T>(
    funnelName: FunnelName
  ) => FunnelTracker<T[FunnelName]>;
};

/**
 * Returns the type-safe `track()` and `selectFunnel()` methods that both
 * `useAltertable()` hooks expose. Each package adds its own client methods.
 */
export function useTrackingApi<T extends FunnelMapping>(
  client: TrackingClient
): TrackingApi<T> {
  /**
   * Type-safe track method for funnel steps.
   *
   * @template Steps The funnel steps type
   * @param eventName The name of the funnel step to track
   * @param properties Properties associated with the step (type-checked based on step definition)
   *
   * @example
   * ```typescript
   * const altertable = useAltertable<MyFunnels>();
   * altertable.track('Email Entered', { email: 'user@example.com' });
   * ```
   */
  const track = useCallback(
    <Steps extends T[keyof T] = T[keyof T]>(
      eventName: FunnelStepName<Steps>,
      properties: FunnelStepProperties<Steps, typeof eventName> = {}
    ) => {
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

  /**
   * Selects a specific funnel for type-safe step tracking.
   *
   * @template FunnelName The name of the funnel to select
   * @param funnelName The name of the funnel (used for type inference only)
   * @returns An object with a `trackStep` method for tracking steps in the selected funnel
   *
   * @example
   * ```typescript
   * const altertable = useAltertable<MyFunnels>();
   * const signupFunnel = altertable.selectFunnel('signup');
   * signupFunnel.trackStep('Email Entered', { email: 'user@example.com' });
   * ```
   */
  const selectFunnel = useCallback(
    <FunnelName extends keyof T>(
      _funnelName: FunnelName
    ): FunnelTracker<T[FunnelName]> =>
      funnelTracker as FunnelTracker<T[FunnelName]>,
    [funnelTracker]
  );

  return { track, selectFunnel };
}
