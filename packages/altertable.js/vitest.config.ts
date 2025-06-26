import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __LIB__: JSON.stringify('dummy'),
    __LIB_VERSION__: JSON.stringify('0.0.0'),
  },
});
