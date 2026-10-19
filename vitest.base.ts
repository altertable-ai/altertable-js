import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: 'true',
    __LIB__: JSON.stringify('TEST_LIB_NAME'),
    __LIB_VERSION__: JSON.stringify('TEST_LIB_VERSION'),
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
