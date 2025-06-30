import { beforeEach, expect } from 'vitest';

import { loggerCache } from '../packages/altertable-js/src/lib/logger';
import { toWarnDev } from './matchers/toWarnDev';

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

interface CustomMatchers<R = unknown> {
  toWarnDev(expectedMessage?: string): R;
}

declare module 'vitest' {
  interface Matchers<T = any> extends CustomMatchers<T> {}
}

beforeEach(() => {
  // We reset the logger cache to get deterministic behaviors in the tests.
  loggerCache.current = {};
});
