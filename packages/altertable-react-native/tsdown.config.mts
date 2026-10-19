import { defineConfig } from 'tsdown';

import { generateBundleBanner } from '../../scripts/release/bundle-banner.mts';
import pkg from './package.json' with { type: 'json' };

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  platform: 'neutral',
  target: 'esnext',
  sourcemap: true,
  clean: true,
  minify: isProduction,
  dts: true,
  deps: { neverBundle: ['react', 'react-native', '@altertable/altertable-js'] },
  banner: { js: generateBundleBanner(pkg) },
  define: {
    __LIB__: JSON.stringify(pkg.name),
    __LIB_VERSION__: JSON.stringify(pkg.version),
  },
});
