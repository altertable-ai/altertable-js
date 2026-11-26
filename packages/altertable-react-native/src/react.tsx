import { mergeEventProperties } from '@altertable/altertable-react-shared';
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
 * The result is stable for a given client but is not the provider's client object.
 */
export function useAltertable(): ReactNativeClient {
  const client = useContext(AltertableContext);
  if (!client) {
    throw new Error(
      '[Altertable] useAltertable() must be used within <AltertableProvider>.'
    );
  }

  return useMemo(
    (): ReactNativeClient => ({
      track: (event, properties) =>
        client.track(event, mergeEventProperties(properties)),
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
    }),
    [client]
  );
}
