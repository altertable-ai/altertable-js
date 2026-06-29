import { TrackingConsent } from './constants';
import { Altertable, type AltertableConfig } from './core';
import { createLogger } from './lib/logger';
import { safelyRunOnBrowser } from './lib/safelyRunOnBrowser';

export type { Altertable, AltertableConfig };
export { createLogger, TrackingConsent };

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
      (altertable[method as keyof Altertable] as any)(...args);
    }
  }

  window.Altertable = altertable;
});
