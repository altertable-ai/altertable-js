import { Altertable } from './core';
import { safelyRunOnBrowser } from './lib/safelyRunOnBrowser';

export type { Altertable };

declare global {
  interface Window {
    Altertable: Altertable | Array<Array<unknown>> | undefined;
  }
}

export const altertable = new Altertable();

safelyRunOnBrowser(({ window }) => {
  const stub = window.Altertable;
  if (stub && Array.isArray(stub)) {
    for (const item of stub) {
      const method = item[0];
      const args = item.slice(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (altertable[method as keyof Altertable] as any)(...args);
    }
  }

  window.Altertable = altertable;
});
