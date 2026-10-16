import { createContext, type ReactNode, useContext } from 'react';

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

/** Return the ready client from the nearest AltertableProvider. Throws outside a provider. */
export function useAltertable(): ReactNativeClient {
  const client = useContext(AltertableContext);
  if (!client) {
    throw new Error(
      '[Altertable] useAltertable() must be used within <AltertableProvider>.'
    );
  }

  return client;
}
