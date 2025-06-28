import { readFileSync } from 'fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: ['src/index.ts'],
  sourcemap: true,
  clean: true,
  format: ['cjs', 'esm', 'iife'],
  dts: true,
  platform: 'neutral',
  external: ['@altertable/altertable-js'],
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
    __LIB__: JSON.stringify(pkg.name),
    __LIB_VERSION__: JSON.stringify(pkg.version),
  },
});
