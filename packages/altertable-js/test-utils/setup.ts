import { expect } from 'vitest';

import { toWarnDev } from './toWarnDev';

expect.extend({
  toWarnDev: (callback: () => void, expectedMessage?: string) => {
    try {
      toWarnDev(callback, expectedMessage);
      return {
        pass: true,
        message: () => 'Expected warning was recorded',
      };
    } catch (error) {
      return {
        pass: false,
        message: () =>
          error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

declare module 'vitest' {
  interface Assertion<T = any> {
    toWarnDev(expectedMessage?: string): T;
  }
}
