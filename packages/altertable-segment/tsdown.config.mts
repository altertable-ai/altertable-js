import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'es2020',
  minify: false,
  clean: true,
  outDir: 'dist',
  dts: false,
  sourcemap: false,
});
