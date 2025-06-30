import { defineConfig } from 'tsup';

import { generateBundleBanner } from '../../scripts/release/bundle-banner';
import pkg from './package.json';

export default defineConfig(({ env }) => {
  if (!env?.mode) {
    throw new Error('`mode` environment variable is not set');
  }

  return {
    entry: ['src/index.ts'],
    sourcemap: true,
    clean: true,
    minify: env.mode === 'production',
    format: ['cjs', 'esm'],
    dts: true,
    platform: 'neutral',
    banner: {
      js: generateBundleBanner(pkg),
    },
    define: {
      __DEV__: JSON.stringify(env.mode === 'development'),
      __LIB__: JSON.stringify(pkg.name),
      __LIB_VERSION__: JSON.stringify(pkg.version),
    },
  };
});
