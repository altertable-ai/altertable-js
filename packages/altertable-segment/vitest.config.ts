import { mergeConfig } from 'vitest/config';

import base from '../../vitest.base';

export default mergeConfig(base, {
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
});
