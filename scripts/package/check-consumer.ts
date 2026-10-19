import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { parse } from 'acorn';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = await mkdtemp(path.join(tmpdir(), 'altertable-consumer-'));
const env = {
  ...process.env,
  npm_config_cache: path.join(fixture, '.npm-cache'),
};

function run(command: string, args: string[]) {
  execFileSync(command, args, { cwd: fixture, env, stdio: 'inherit' });
}

function pack(name: string) {
  const output = execFileSync(
    'npm',
    [
      'pack',
      path.join(root, 'packages', name),
      '--pack-destination',
      fixture,
      '--json',
      '--ignore-scripts',
    ],
    { cwd: fixture, env, encoding: 'utf8' }
  );
  return `file:${path.join(fixture, JSON.parse(output)[0].filename)}`;
}

try {
  const coreManifest = JSON.parse(
    await readFile(
      path.join(root, 'packages/altertable-js/package.json'),
      'utf8'
    )
  );
  assert.equal(
    Object.keys(coreManifest.dependencies ?? {}).length,
    0,
    'Core must have no runtime dependencies'
  );
  const core = pack('altertable-js');
  const react = pack('altertable-react');
  const globalBundle = await readFile(
    path.join(root, 'packages/altertable-js/dist/index.global.js'),
    'utf8'
  );
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  runInNewContext(
    `${globalBundle}\nif (typeof Altertable.Altertable !== 'function') throw new Error('Missing global SDK');`,
    context
  );
  const snippet = await readFile(
    path.join(root, 'packages/altertable-snippet/dist/index.global.js'),
    'utf8'
  );
  parse(snippet, { ecmaVersion: 5 });
  const window: { Altertable?: unknown[][] } = {};
  const inserted: unknown[] = [];
  runInNewContext(snippet, {
    window,
    document: {
      createElement: () => ({}),
      getElementsByTagName: () => [
        {
          parentNode: {
            insertBefore: (script: unknown) => inserted.push(script),
          },
        },
      ],
    },
  });
  assert.equal(window.Altertable?.[0]?.[0], 'init');
  assert.equal(inserted.length, 1);

  for (const version of ['16.8.0', '19.3.0']) {
    await rm(path.join(fixture, 'node_modules'), {
      recursive: true,
      force: true,
    });
    await rm(path.join(fixture, 'bun.lock'), { force: true });
    await writeFile(
      path.join(fixture, 'package.json'),
      JSON.stringify({
        name: 'altertable-packed-consumer',
        private: true,
        dependencies: {
          '@altertable/altertable-js': core,
          '@altertable/altertable-react': react,
          react: version,
          'react-dom': version,
          '@types/react': version === '16.8.0' ? '16.8.0' : '19.3.0',
          typescript: '7.0.2',
        },
      })
    );
    run('bun', ['install', '--ignore-scripts']);
    const body = `
const assert = require('node:assert/strict');
const React = require('react');
const { renderToString } = require('react-dom/server');
function Consumer() {
  assert.equal(typeof sdk.useAltertable().track, 'function');
  return React.createElement('span', null, 'packed consumer');
}
assert.match(renderToString(React.createElement(sdk.AltertableProvider, { client: new core.Altertable() }, React.createElement(Consumer))), /packed consumer/);
`;
    await writeFile(
      path.join(fixture, 'runtime.cjs'),
      `const core = require('@altertable/altertable-js');\nconst sdk = require('@altertable/altertable-react');\n${body}`
    );
    await writeFile(
      path.join(fixture, 'runtime.mjs'),
      `import * as core from '@altertable/altertable-js';\nimport * as sdk from '@altertable/altertable-react';\nimport { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n${body}`
    );
    run('node', ['runtime.cjs']);
    run('node', ['runtime.mjs']);
    const types = `
import { Altertable, type AltertableConfig, type EventProperties } from '@altertable/altertable-js';
import { AltertableProvider, useAltertable } from '@altertable/altertable-react';
const config: Partial<AltertableConfig> = { autoCapture: false };
const client = new Altertable();
client.configure(config);
const props: EventProperties = { source: 'packed-consumer' };
client.track('consumer', props);
const provider: typeof AltertableProvider = AltertableProvider;
const hook: typeof useAltertable = useAltertable;
void [provider, hook];
`;
    await writeFile(path.join(fixture, 'consumer.mts'), types);
    await writeFile(path.join(fixture, 'consumer.cts'), types);
    for (const [module, moduleResolution] of [
      ['NodeNext', 'NodeNext'],
      ['ESNext', 'Bundler'],
    ]) {
      run('node', [
        'node_modules/typescript/bin/tsc',
        '--noEmit',
        '--strict',
        '--module',
        module!,
        '--moduleResolution',
        moduleResolution!,
        '--target',
        'ES2020',
        'consumer.mts',
        'consumer.cts',
      ]);
    }
    console.log(
      `Passed packed CJS/ESM runtime and NodeNext/Bundler types with React ${version}`
    );
  }
} finally {
  await rm(fixture, { recursive: true, force: true });
}
