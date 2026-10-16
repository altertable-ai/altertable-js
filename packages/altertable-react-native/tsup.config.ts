import { defineConfig } from 'tsup';

import { generateBundleBanner } from '../../scripts/release/bundle-banner';
import pkg from './package.json';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  platform: 'neutral',
  sourcemap: true,
  clean: true,
  dts: true,
  external: ['react', 'react-native', '@altertable/altertable-js'],
  banner: { js: generateBundleBanner(pkg) },
  define: {
    __LIB__: JSON.stringify(pkg.name),
    __LIB_VERSION__: JSON.stringify(pkg.version),
  },
});
