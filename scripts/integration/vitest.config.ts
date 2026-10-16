/**
 * Integration tests import built core and React Native packages. Build both first
 * locally (`bun run build --scope=@altertable/altertable-js --scope=@altertable/altertable-react-native`). CI runs the same build
 * before `test:integration`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(path.dirname(configDir));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      'react-native': path.join(
        repoRoot,
        'packages/altertable-react-native/test/reactNativeMock.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['scripts/integration/*.integration.test.ts'],
    // Flush can issue several HTTP calls; each may retry (see Requester), so stay above worst-case retry windows.
    testTimeout: 45_000,
    watch: false,
  },
});
