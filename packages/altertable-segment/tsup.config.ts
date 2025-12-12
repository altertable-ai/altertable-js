import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'es2020',
  minify: false,
  clean: true,
  outDir: 'dist',
  noExternal: [],
  dts: false,
  sourcemap: false,
  bundle: true,
});
