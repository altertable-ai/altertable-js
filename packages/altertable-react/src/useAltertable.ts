import {
  type FunnelMapping,
  useTrackingApi,
} from '@altertable/altertable-react-shared';
import { useMemo } from 'react';

import { useAltertableContext } from './AltertableProvider';

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
  const { track, selectFunnel } = useTrackingApi<T>(altertable);

  return useMemo(
    () => ({
      alias: altertable.alias.bind(altertable),
      configure: altertable.configure.bind(altertable),
      flush: altertable.flush.bind(altertable),
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
