#!/usr/bin/env bun

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();
const PACKAGES_DIR = join(ROOT_DIR, 'packages');
const EXAMPLES_DIR = join(ROOT_DIR, 'examples');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function spawnProcess(
  command: string,
  args: string[],
  cwd: string,
  name: string
) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'pipe',
    shell: true,
  });

  child.stdout?.on('data', data => {
    const output = data.toString().trim();
    if (output) {
      log(`[${name}] ${output}`, 'cyan');
    }
  });

  child.stderr?.on('data', data => {
    const output = data.toString().trim();
    if (output) {
      log(`[${name}] ${output}`, 'red');
    }
  });

  child.on('error', error => {
    log(`[${name}] Error: ${error.message}`, 'red');
  });

  child.on('close', code => {
    if (code !== 0) {
      log(`[${name}] Process exited with code ${code}`, 'red');
    }
  });

  return child;
}

async function main() {
  log('🚀 Starting Altertable Development Environment', 'bright');

  // Check if packages exist
  const packages = ['altertable-js', 'altertable-react', 'altertable-snippet'];
  const existingPackages = packages.filter(pkg =>
    existsSync(join(PACKAGES_DIR, pkg))
  );

  if (existingPackages.length === 0) {
    log('❌ No packages found in packages/ directory', 'red');
    process.exit(1);
  }

  log(`📦 Found packages: ${existingPackages.join(', ')}`, 'green');

  // Start package watch builds
  log('🔨 Starting package watch builds...', 'yellow');
  const packageProcesses = existingPackages.map(pkg => {
    const pkgDir = join(PACKAGES_DIR, pkg);
    return spawnProcess('bun', ['run', 'build:watch'], pkgDir, pkg);
  });

  // Check if examples exist
  const examples = ['example-react'];
  const existingExamples = examples.filter(example =>
    existsSync(join(EXAMPLES_DIR, example))
  );

  if (existingExamples.length > 0) {
    log(`📱 Found examples: ${existingExamples.join(', ')}`, 'green');

    // Wait a bit for packages to build initially
    log('⏳ Waiting for initial package builds...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Start example development servers
    log('🌐 Starting example development servers...', 'yellow');
    const exampleProcesses = existingExamples.map(example => {
      const exampleDir = join(EXAMPLES_DIR, example);
      return spawnProcess('bun', ['run', 'dev'], exampleDir, example);
    });

    log('✅ Development environment ready!', 'green');
    log('📦 Packages are building in watch mode', 'blue');
    log('🌐 Examples are running on their respective ports', 'blue');
    log(
      '💡 Make changes to packages and see them reflected in examples',
      'blue'
    );
    log('🛑 Press Ctrl+C to stop all processes', 'yellow');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      log('\n🛑 Shutting down development environment...', 'yellow');
      [...packageProcesses, ...exampleProcesses].forEach(process => {
        process.kill('SIGTERM');
      });
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {});
  } else {
    log('⚠️  No examples found, running packages only', 'yellow');
    log('💡 Press Ctrl+C to stop all processes', 'yellow');

    process.on('SIGINT', () => {
      log('\n🛑 Shutting down development environment...', 'yellow');
      packageProcesses.forEach(process => {
        process.kill('SIGTERM');
      });
      process.exit(0);
    });

    await new Promise(() => {});
  }
}

main().catch(error => {
  log(`❌ Error: ${error.message}`, 'red');
  process.exit(1);
});
