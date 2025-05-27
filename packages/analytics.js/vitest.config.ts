import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __LIB__: JSON.stringify(pkg.name),
    __LIB_VERSION__: JSON.stringify(pkg.version),
  },
});
