import { createContext, type ReactNode, useContext } from 'react';

import type { ReactNativeClient } from './client';

const AltertableContext = createContext<ReactNativeClient | null>(null);
AltertableContext.displayName = 'AltertableContext';

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

export function useAltertable(): ReactNativeClient {
  const client = useContext(AltertableContext);
  if (!client) {
    throw new Error(
      '[Altertable] useAltertable() must be used within <AltertableProvider>.'
    );
  }

  return client;
}
