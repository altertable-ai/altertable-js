import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.js'],
  format: ['iife'],
  globalName: 'Altertable',
  platform: 'browser',
  target: 'es5',
  minify: true,
  clean: true,
  outDir: 'dist',
  noExternal: [],
});
