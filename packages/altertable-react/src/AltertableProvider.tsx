import { Altertable, altertable } from '@altertable/altertable-js';
import React, { createContext, useContext, type ReactNode } from 'react';

const AltertableContext = createContext<Altertable>(altertable);
AltertableContext.displayName = 'AltertableContext';

interface AltertableProviderProps {
  client: Altertable;
  children: ReactNode;
}

export function AltertableProvider({
  client,
  children,
}: AltertableProviderProps) {
  // FIXME: throw or warn when the client isn't initialized

  return (
    <AltertableContext.Provider value={client}>
      {children}
    </AltertableContext.Provider>
  );
}

export function useAltertableContext() {
  return useContext(AltertableContext);
}
