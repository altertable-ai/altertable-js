import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __LIB__: JSON.stringify('TEST_LIB_NAME'),
    __LIB_VERSION__: JSON.stringify('TEST_LIB_VERSION'),
  },
});
