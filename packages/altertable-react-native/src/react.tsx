import {
  type FunnelMapping,
  useTrackingApi,
} from '@altertable/altertable-react-shared';
import { mergeEventProperties } from '@altertable/altertable-shared';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

import type { ReactNativeClient } from './client';

const AltertableContext = createContext<ReactNativeClient | null>(null);
AltertableContext.displayName = 'AltertableContext';

/**
 * Share a ready client with descendants. The provider does not initialize or dispose it.
 * Create the client during app startup and keep its lifetime outside screen components.
 */
export function AltertableProvider({
  client,
  children,
}: {
  client: ReactNativeClient;
  children: ReactNode;
}) {
  return (
    <AltertableContext.Provider value={client}>
      {children}
    </AltertableContext.Provider>
  );
}

/**
 * Return the client API for the nearest AltertableProvider. Throws outside a provider.
 *
 * @template T A FunnelMapping type that defines your application's funnels and their steps
 *
 * @example
 * ```tsx
 * type AppFunnels = {
 *   checkout: [
 *     { name: 'Cart Viewed'; properties: { itemCount: number } },
 *     { name: 'Order Completed'; properties: { total: number } },
 *   ];
 * };
 *
 * const client = useAltertable<AppFunnels>();
 * client.selectFunnel('checkout').trackStep('Order Completed', { total: 42 });
 * ```
 */
export function useAltertable<T extends FunnelMapping = FunnelMapping>() {
  const client = useContext(AltertableContext);
  if (!client) {
    throw new Error(
      '[Altertable] useAltertable() must be used within <AltertableProvider>.'
    );
  }

  const { track, selectFunnel } = useTrackingApi<T>(client);

  return useMemo(() => {
    // Annotated so that a client method missing here fails typecheck.
    const methods: Omit<ReactNativeClient, 'track'> = {
      screen: (name, options) =>
        client.screen(name, {
          ...options,
          properties: mergeEventProperties(options?.properties),
        }),
      identify: (...args) => client.identify(...args),
      alias: (...args) => client.alias(...args),
      updateTraits: (...args) => client.updateTraits(...args),
      getTrackingConsent: () => client.getTrackingConsent(),
      reset: (...args) => client.reset(...args),
      configure: updates => client.configure(updates),
      flush: () => client.flush(),
      flushPersistence: () => client.flushPersistence(),
      dispose: () => client.dispose(),
    };

    return { ...methods, track, selectFunnel };
  }, [client, track, selectFunnel]);
}
