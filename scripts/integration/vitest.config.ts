/**
 * Integration tests import `packages/altertable-js/dist`. Build that package first
 * locally (`cd packages/altertable-js && bun run build`). CI runs the same build
 * before `test:integration`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(path.dirname(configDir));

export default defineConfig({
  root: repoRoot,
  test: {
    environment: 'node',
    include: ['scripts/integration/altertable.integration.test.ts'],
    // Flush can issue several HTTP calls; each may retry (see Requester), so stay above worst-case retry windows.
    testTimeout: 45_000,
    watch: false,
  },
});
