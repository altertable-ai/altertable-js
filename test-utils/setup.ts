import { beforeEach, expect } from 'vitest';

import { loggerCache } from '../packages/altertable-js/src/lib/logger';
import type { RequestOptions } from './matchers/toRequestApi';
import { toRequestApi } from './matchers/toRequestApi';
import { toWarnDev } from './matchers/toWarnDev';

// Extend expect with custom matchers
expect.extend({
  toWarnDev,
  toRequestApi,
});

interface CustomMatchers<R = unknown> {
  toWarnDev(expectedMessage?: string): R;
  toRequestApi(path?: string, options?: RequestOptions): R;
}

declare module 'vitest' {
  interface Matchers<T = any> extends CustomMatchers<T> {}
  interface Assertion<T = any> extends CustomMatchers<T> {}
}

// Custom Blob for payload inspection in tests
class TestBlob extends Blob {
  private _content: string;
  constructor(content: string[], options?: BlobPropertyBag) {
    super(content, options);
    this._content = content.join('');
  }
  get content() {
    return this._content;
  }
  text(): Promise<string> {
    return Promise.resolve(this._content);
  }
}
(global as any).Blob = TestBlob;

beforeEach(() => {
  // Reset the logger cache to get deterministic behaviors in the tests.
  loggerCache.current = {};
});
