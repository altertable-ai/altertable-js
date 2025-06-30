#!/usr/bin/env bun

import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();
const PACKAGES_DIR = join(ROOT_DIR, 'packages');
const EXAMPLES_DIR = join(ROOT_DIR, 'examples');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bgBlue: '\x1b[44m',
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
  log('Altertable JavaScript Development Environment', 'blue');
  log('');

  // Dynamically scan packages directory
  const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort();

  if (packages.length === 0) {
    log('❌ No packages found in packages/ directory', 'red');
    process.exit(1);
  }

  log(`📦 Packages: ${packages.join(', ')}`, 'green');

  const packageProcesses = packages.map(pkg => {
    const pkgDir = join(PACKAGES_DIR, pkg);
    return spawnProcess('bun', ['run', 'dev'], pkgDir, pkg);
  });

  // Dynamically scan examples directory
  const examples = readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort();

  if (examples.length > 0) {
    log(`🖥️  Examples: ${examples.join(', ')}`, 'green');

    log('');
    await new Promise(resolve => setTimeout(resolve, 3000));

    log('');

    const exampleProcesses = examples.map(example => {
      const exampleDir = join(EXAMPLES_DIR, example);
      return spawnProcess('bun', ['run', 'dev'], exampleDir, example);
    });

    log('📦 Packages are building in watch mode', 'blue');
    log('🌐 Examples are running on their respective ports', 'blue');
    log(
      '💡 Make changes to packages and see them reflected in examples',
      'blue'
    );
    log('🛑 Press Ctrl+C to stop all processes', 'yellow');
    log('');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      log('\n🛑 Shutting down development environment...', 'yellow');
      [...packageProcesses, ...exampleProcesses].forEach(process => {
        process.kill('SIGTERM');
      });
      process.exit(0);
    });

    await new Promise(() => {});
  } else {
    log('⚠️  No examples found, running packages only', 'yellow');
    log('💡 Press Ctrl+C to stop all processes', 'yellow');
    log('');

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
