import { type Altertable, altertable } from '@altertable/altertable-js';
import React, { createContext, type ReactNode, useContext } from 'react';

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
  return (
    <AltertableContext.Provider value={client}>
      {children}
    </AltertableContext.Provider>
  );
}

export function useAltertableContext() {
  return useContext(AltertableContext);
}
