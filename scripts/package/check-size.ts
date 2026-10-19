import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import config from '../../bundlesize.config.json';

for (const { path, maxSize } of config.files) {
  const match = /^(\d+(?:\.\d+)?) kB$/.exec(maxSize);
  assert(match, `Invalid size limit: ${maxSize}`);
  // bundlesize uses binary kilobytes and gzip level 9. Keep the same budgets.
  const limit = Number(match[1]) * 1024;
  const size = gzipSync(readFileSync(path), { level: 9 }).length;
  console.log(`${path}: ${size} / ${limit} bytes (gzip)`);
  assert(size <= limit, `${path} exceeds ${maxSize}`);
}
