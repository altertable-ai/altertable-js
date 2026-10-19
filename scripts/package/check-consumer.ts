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
  const snippetContext = {
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
  };
  runInNewContext(snippet, snippetContext);
  assert.deepEqual(Object.keys(snippetContext).sort(), ['document', 'window']);
  assert.equal(window.Altertable?.[0]?.[0], 'init');
  assert.equal(inserted.length, 1);

  // Keep the minimum runtime on maintained React 16 types, which include React.JSX.
  const reactTypeVersions = {
    '16.14.0': '16.14.70',
    '19.3.0': '19.3.0',
  };

  for (const [version, reactTypes] of Object.entries(reactTypeVersions)) {
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
        overrides: { '@altertable/altertable-js': core },
        dependencies: {
          '@altertable/altertable-js': core,
          '@altertable/altertable-react': react,
          react: version,
          'react-dom': version,
          '@types/react': reactTypes,
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
const track = core.altertable.track;
const events = [];
core.altertable.track = event => events.push(event);
function DefaultConsumer() {
  sdk.useAltertable().track('shared singleton');
  return null;
}
renderToString(React.createElement(DefaultConsumer));
core.altertable.track = track;
assert.deepEqual(events, ['shared singleton']);
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
    const browserEntry = path.join(fixture, 'browser.mjs');
    await writeFile(
      browserEntry,
      `
import React from 'react';
import { renderToString } from 'react-dom/server.browser';
import { Altertable } from '@altertable/altertable-js';
import { AltertableProvider, useAltertable } from '@altertable/altertable-react';
function Consumer() {
  if (typeof useAltertable().track !== 'function') throw new Error('Missing hook');
  return React.createElement('span', null, 'packed browser consumer');
}
const rendered = renderToString(React.createElement(AltertableProvider, { client: new Altertable() }, React.createElement(Consumer)));
if (!rendered.includes('packed browser consumer')) throw new Error('Browser rendering failed');
`
    );
    const browserBuild = await Bun.build({
      entrypoints: [browserEntry],
      target: 'browser',
      format: 'esm',
      conditions: ['module'],
      outdir: path.join(fixture, 'browser'),
      naming: '[name].mjs',
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      metafile: true,
    });
    assert(browserBuild.success, 'Browser consumer must bundle successfully');
    assert(browserBuild.metafile, 'Browser consumer must report its inputs');
    for (const name of ['altertable-js', 'altertable-react']) {
      assert(
        Object.keys(browserBuild.metafile.inputs).some(input =>
          input.endsWith(`@altertable/${name}/dist/index.mjs`)
        ),
        `Browser consumers must use the emitted ESM ${name}`
      );
    }
    run('node', [
      '--input-type=module',
      '--eval',
      // React's browser scheduler can keep MessagePorts alive in Node.
      "await import('./browser/browser.mjs'); process.exit(0);",
    ]);
    const types = `
import { Altertable, type AltertableConfig, type EventProperties } from '@altertable/altertable-js';
export { AltertableProvider, useAltertable } from '@altertable/altertable-react';
const config: Partial<AltertableConfig> = { autoCapture: false };
const client = new Altertable();
client.configure(config);
const props: EventProperties = { source: 'packed-consumer' };
client.track('consumer', props);
`;
    await writeFile(path.join(fixture, 'consumer.mts'), types);
    await writeFile(path.join(fixture, 'consumer.cts'), types);
    await writeFile(
      path.join(fixture, 'consumer.tsx'),
      `
import { Altertable } from '@altertable/altertable-js';
import { AltertableProvider, useAltertable } from '@altertable/altertable-react';

type Funnels = {
  signup: [
    { name: 'Email Entered'; properties: { email: string } },
    { name: 'Account Created'; properties: { plan: 'free' | 'paid' } },
  ];
  checkout: [{ name: 'Order Completed'; properties: { total: number } }];
};

function Consumer() {
  const analytics = useAltertable<Funnels>();
  analytics.track('Email Entered', { email: 'user@example.com' });
  analytics.track('Order Completed', { total: 42 });
  const signup = analytics.selectFunnel('signup');
  signup.trackStep('Email Entered', { email: 'user@example.com' });
  signup.trackStep('Account Created', { plan: 'paid' });
  // @ts-expect-error Unknown event names must be rejected.
  analytics.track('Unknown Event', {});
  // @ts-expect-error Event properties must retain their inferred types.
  analytics.track('Email Entered', { email: 123 });
  // @ts-expect-error Unknown funnel names must be rejected.
  analytics.selectFunnel('missing');
  // @ts-expect-error A selected funnel cannot track another funnel's steps.
  signup.trackStep('Order Completed', { total: 42 });
  // @ts-expect-error Step properties must retain their inferred types.
  signup.trackStep('Email Entered', { email: 123 });
  // @ts-expect-error Literal property types must be preserved.
  signup.trackStep('Account Created', { plan: 'enterprise' });
  return <span>Typed consumer</span>;
}

const client = new Altertable();
const app = <AltertableProvider client={client}><Consumer /></AltertableProvider>;
// @ts-expect-error The provider requires an Altertable client.
const invalid = <AltertableProvider client={{}}><Consumer /></AltertableProvider>;
void [app, invalid];
`
    );
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
        '--jsx',
        'react-jsx',
        'consumer.mts',
        'consumer.cts',
        'consumer.tsx',
      ]);
    }
    console.log(
      `Passed packed Node CJS/ESM imports, browser ESM, and NodeNext/Bundler types with React ${version}`
    );
  }
} finally {
  await rm(fixture, { recursive: true, force: true });
}
