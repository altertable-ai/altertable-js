import { Reaping } from './core';

declare global {
  interface Window {
    Reaping: Reaping | Array<Array<unknown>> | undefined;
  }
}

export const reaping = new Reaping();

const stub = window.Reaping;
if (stub && Array.isArray(stub)) {
  for (const item of stub) {
    const method = item[0];
    const args = item.slice(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (reaping[method as keyof Reaping] as any)(...args);
  }
}

window.Reaping = reaping;
