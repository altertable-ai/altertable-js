import { fileURLToPath } from 'node:url';

import { mergeConfig } from 'vitest/config';

import base from '../../vitest.base';

export default mergeConfig(base, {
  define: {
    __DEV__: 'true',
    __LIB__: JSON.stringify('TEST_NATIVE_LIB'),
    __LIB_VERSION__: JSON.stringify('TEST_VERSION'),
  },
  resolve: {
    alias: {
      'react-native': fileURLToPath(
        new URL('./test/reactNativeMock.ts', import.meta.url)
      ),
      '@altertable/altertable-js': fileURLToPath(
        new URL('../altertable-js/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    coverage: { include: ['src/**/*.{ts,tsx}'] },
  },
});
