import { defineConfig } from 'tsdown';

import { generateBundleBanner } from '../../scripts/release/bundle-banner.mts';
import pkg from './package.json' with { type: 'json' };

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  entry: ['src/index.ts'],
  target: 'esnext',
  sourcemap: true,
  clean: true,
  minify: isProduction,
  format: {
    cjs: {},
    esm: {},
    iife: {
      outputOptions: { entryFileNames: '[name].global.js' },
      // The CDN script runs without a bundler, so `process` is not defined.
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    },
  },
  dts: { tsconfig: '../tsconfig.altertable-js.build.json' },
  platform: 'neutral',
  globalName: 'Altertable',
  banner: {
    js: generateBundleBanner(pkg),
  },
  define: {
    __LIB__: JSON.stringify(pkg.name),
    __LIB_VERSION__: JSON.stringify(pkg.version),
  },
});
