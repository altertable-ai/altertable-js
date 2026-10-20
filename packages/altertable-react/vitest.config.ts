import { mergeConfig } from 'vitest/config';

import base from '../../vitest.base';

export default mergeConfig(base, {
  test: {
    coverage: {
      exclude: ['src/index.ts'],
    },
    environment: 'jsdom',
    setupFiles: ['../../test-utils/setup.ts'],
  },
});
