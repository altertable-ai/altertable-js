import { defineConfig } from 'tsup';

import { generateBundleBanner } from '../../scripts/release/bundle-banner';
import pkg from './package.json';

export default defineConfig(({ env }) => {
  if (!env?.mode) {
    throw new Error('`mode` environment variable is not set');
  }

  return {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    platform: 'neutral',
    sourcemap: true,
    clean: true,
    minify: env.mode === 'production',
    dts: true,
    external: ['react', 'react-native', '@altertable/altertable-js'],
    banner: { js: generateBundleBanner(pkg) },
    define: {
      __LIB__: JSON.stringify(pkg.name),
      __LIB_VERSION__: JSON.stringify(pkg.version),
    },
  };
});
