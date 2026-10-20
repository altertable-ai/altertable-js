import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '../..');
const runtime = process.argv[2];
if (runtime !== 'minimum' && runtime !== 'current') {
  throw new Error('Choose a runtime: minimum or current.');
}
const example = JSON.parse(
  await readFile(
    path.join(root, 'examples/example-react-native/package.json'),
    'utf8'
  )
);
const versions =
  runtime === 'minimum'
    ? { react: '19.1.0', native: '0.81.0', reactTypes: '19.1.0' }
    : {
        react: example.dependencies.react,
        native: example.dependencies['react-native'],
        reactTypes: example.devDependencies['@types/react'],
      };
const fixture = await mkdtemp(
  path.join(tmpdir(), `altertable-native-${runtime}-`)
);
const env = {
  ...process.env,
  npm_config_cache: path.join(fixture, '.npm-cache'),
};

function run(command: string, args: string[]) {
  execFileSync(command, args, { cwd: fixture, env, stdio: 'inherit' });
}

function pack(packageName: string) {
  const output = execFileSync(
    'npm',
    [
      'pack',
      path.join(root, 'packages', packageName),
      '--pack-destination',
      fixture,
      '--json',
      '--ignore-scripts',
    ],
    { cwd: fixture, env, encoding: 'utf8' }
  );
  const [{ filename }] = JSON.parse(output);

  return `file:${path.join(fixture, filename)}`;
}

try {
  console.log(
    `Checking RN ${versions.native} / React ${versions.react} (${runtime})`
  );
  const core = pack('altertable-js');
  const native = pack('altertable-react-native');
  await writeFile(
    path.join(fixture, 'package.json'),
    JSON.stringify(
      {
        name: 'altertable-native-qualification',
        private: true,
        version: '0.0.0',
        overrides: { '@altertable/altertable-js': core },
        dependencies: {
          '@altertable/altertable-js': core,
          '@altertable/altertable-react-native': native,
          react: versions.react,
          'react-native': versions.native,
          '@types/react': versions.reactTypes,
          '@react-native/metro-config': versions.native,
          '@react-native/babel-preset': versions.native,
          typescript: '7.0.2',
        },
      },
      null,
      2
    )
  );
  await copyFile(
    path.join(scriptDir, 'fixture/App.tsx'),
    path.join(fixture, 'App.tsx')
  );
  await writeFile(
    path.join(fixture, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        jsx: 'react-jsx',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        target: 'ESNext',
        lib: ['ESNext'],
      },
      include: ['App.tsx'],
    })
  );
  await writeFile(
    path.join(fixture, 'babel.config.cjs'),
    "module.exports = { presets: ['module:@react-native/babel-preset'] };\n"
  );
  await writeFile(
    path.join(fixture, 'metro.config.cjs'),
    "const { getDefaultConfig } = require('@react-native/metro-config');\nmodule.exports = getDefaultConfig(__dirname);\n"
  );
  run('bun', ['install', '--ignore-scripts']);
  run('node', [
    'node_modules/typescript/bin/tsc',
    '--project',
    'tsconfig.json',
  ]);
  for (const platform of ['ios', 'android']) {
    run('node', [
      'node_modules/metro/src/cli.js',
      'build',
      'App.tsx',
      '--config',
      'metro.config.cjs',
      '--platform',
      platform,
      '--out',
      `${platform}.js`,
      '--max-workers',
      '2',
      '--dev',
      'false',
      '--minify',
      'true',
    ]);
  }
  console.log(
    `Passed typecheck and iOS/Android Metro bundles for ${runtime}. Native execution remains a separate device check.`
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
}
