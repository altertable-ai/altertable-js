import { loggerCache } from '@altertable/altertable-shared';
import { beforeEach } from 'vitest';

beforeEach(() => {
  // Warnings print once per process, so reset them between tests.
  loggerCache.clear();
});
