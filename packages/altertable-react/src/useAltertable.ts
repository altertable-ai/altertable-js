import { useCallback, useMemo } from 'react';

import { useAltertableContext } from './AltertableProvider';
import { PROPERTY_LIB, PROPERTY_LIB_VERSION } from './constants';
import { FunnelMapping, FunnelStepName, FunnelStepProperties } from './types';

/**
 * `useAltertable()` provides access to type-safe event and funnel tracking for Altertable.
 *
 * @template T A FunnelMapping type that defines your application's funnels and their steps
 * @returns An object containing all Altertable methods with type-safe funnel tracking
 *
 * @example
 * ```typescript
 * type AppFunnel = {
 *   signup: [
 *     { name: 'Email Entered'; properties: { email: string } },
 *     { name: 'Password Created'; properties: { strength: string } },
 *     { name: 'Account Created'; properties: { userId: string } }
 *   ];
 * };
 *
 * function SignupPage() {
 *   const altertable = useAltertable<AppFunnel>();
 *   const signupFunnel = altertable.selectFunnel('signup');
 *
 *   function handleSignup() {
 *     signupFunnel.trackStep('Email Entered', { email: 'user@example.com' });
 *   }
 *
 *   return <button onClick={handleSignup}>Sign Up</button>;
 * }
 * ```
 */
export function useAltertable<T extends FunnelMapping>() {
  const altertable = useAltertableContext();

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
      altertable.track(eventName, {
        ...properties,
        // The React library needs to override the lib properties coming from
        // the core library
        [PROPERTY_LIB]: __LIB__,
        [PROPERTY_LIB_VERSION]: __LIB_VERSION__,
      });
    },
    [altertable]
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
    <FunnelName extends keyof T>(_funnelName: FunnelName) => ({
      trackStep: track<T[FunnelName]>,
    }),
    [track]
  );

  return useMemo(
    () => ({
      alias: altertable.alias.bind(altertable),
      configure: altertable.configure.bind(altertable),
      getTrackingConsent: altertable.getTrackingConsent.bind(altertable),
      identify: altertable.identify.bind(altertable),
      page: altertable.page.bind(altertable),
      reset: altertable.reset.bind(altertable),
      track,
      updateTraits: altertable.updateTraits.bind(altertable),
      selectFunnel,
    }),
    [altertable, track, selectFunnel]
  );
}
