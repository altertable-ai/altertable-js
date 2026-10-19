import { mergeConfig } from 'vitest/config';

import base from '../../vitest.base';

export default mergeConfig(base, {
  test: {
    environment: 'jsdom',
    setupFiles: ['../../test-utils/setup.ts'],
  },
});
