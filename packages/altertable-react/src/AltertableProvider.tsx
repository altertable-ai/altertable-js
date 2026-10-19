import { type Altertable, altertable } from '@altertable/altertable-js';
import React, { createContext, type ReactNode, useContext } from 'react';

const AltertableContext = createContext<Altertable>(altertable);
AltertableContext.displayName = 'AltertableContext';

interface AltertableProviderProps {
  client: Altertable;
  children: ReactNode;
}

/**
 * React context provider for the Altertable client.
 *
 * Wrap your application with this provider to make the Altertable client
 * available to all child components via the `useAltertable` hook.
 *
 * @example
 * ```typescript
 * import { altertable } from '@altertable/altertable-js';
 * import { AltertableProvider } from '@altertable/altertable-react';
 *
 * altertable.init('YOUR_API_KEY');
 *
 * function App() {
 *   return (
 *     <AltertableProvider client={altertable}>
 *       <Page />
 *     </AltertableProvider>
 *   );
 * }
 * ```
 */
export function AltertableProvider({
  /** The Altertable client instance */
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
