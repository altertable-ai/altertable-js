#!/usr/bin/env bun

import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const NPM_ORG_NAME = 'altertable';
const GITHUB_REPO_URL = 'https://github.com/altertable-ai/altertable-js';
const GIT_MAIN_BRANCH = 'main';
const PACKAGES_FOLDER = 'packages';
const ALLOWED_BASE_BRANCHES = [GIT_MAIN_BRANCH];
const IGNORED_PACKAGES = [`@${NPM_ORG_NAME}/altertable-snippet`];

interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

function readPackageJson(filePath: string): PackageJson {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function writePackageJson(filePath: string, packageJson: PackageJson): void {
  const content = JSON.stringify(packageJson, null, 2) + '\n';
  writeFileSync(filePath, content, 'utf-8');
}

function findPackageJsonFiles(packagesDir: string): string[] {
  const packageJsonFiles: string[] = [];

  try {
    const packages = readdirSync(packagesDir);

    for (const packageName of packages) {
      const packagePath = join(packagesDir, packageName);
      const packageJsonPath = join(packagePath, 'package.json');

      try {
        const stats = statSync(packageJsonPath);
        if (stats.isFile()) {
          packageJsonFiles.push(packageJsonPath);
        }
      } catch {
        // `package.json` doesn't exist in this package, skip it
      }
    }
  } catch (error) {
    console.error(`Error reading packages directory: ${error}`);
  }

  return packageJsonFiles;
}

function updateVersion(
  packageJson: PackageJson,
  newVersion: string
): PackageJson {
  return {
    ...packageJson,
    version: newVersion,
  };
}

function updateDependencyVersion(
  packageJson: PackageJson,
  dependencyName: string,
  newVersion: string
): PackageJson {
  const updatedPackageJson = { ...packageJson };

  if (
    updatedPackageJson.dependencies &&
    updatedPackageJson.dependencies[dependencyName]
  ) {
    updatedPackageJson.dependencies[dependencyName] = `^${newVersion}`;
  }

  if (
    updatedPackageJson.peerDependencies &&
    updatedPackageJson.peerDependencies[dependencyName]
  ) {
    updatedPackageJson.peerDependencies[dependencyName] = `^${newVersion}`;
  }

  return updatedPackageJson;
}

function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;

    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }

  return 0;
}

function checkGitStatus(): boolean {
  const statusResult = Bun.spawnSync(['git', 'status', '--porcelain']);
  return (
    statusResult.exitCode === 0 && statusResult.stdout.toString().trim() === ''
  );
}

function getCurrentBranch(): string {
  const branchResult = Bun.spawnSync(['git', 'branch', '--show-current']);
  if (branchResult.exitCode === 0) {
    return branchResult.stdout.toString().trim();
  }
  return '';
}

function getReleaseBranchName(version: string): string {
  return `release/v${version}`;
}

function checkBaseBranch(): boolean {
  const currentBranch = getCurrentBranch();
  if (!ALLOWED_BASE_BRANCHES.includes(currentBranch)) {
    console.error(`❌ Current branch '${currentBranch}' is not allowed.`);
    console.error(
      `   Allowed base branches: ${ALLOWED_BASE_BRANCHES.join(', ')}`
    );
    console.error(`   Please checkout an allowed branch first.`);
    return false;
  }
  return true;
}

function createReleaseBranch(version: string): boolean {
  const branchName = getReleaseBranchName(version);
  console.log(`🌿 Creating release branch: ${branchName}`);

  const checkoutResult = Bun.spawnSync(['git', 'checkout', '-b', branchName]);
  return checkoutResult.exitCode === 0;
}

async function main(): Promise<void> {
  console.log('🚀 Altertable Version Bumper');
  console.log('================================\n');

  if (!checkGitStatus()) {
    console.error(
      '❌ Git tree is not clean. Please commit or stash your changes before proceeding.'
    );
    console.error('   Run: git status');
    process.exit(1);
  }

  if (!checkBaseBranch()) {
    process.exit(1);
  }

  const packageJsonFiles = findPackageJsonFiles(PACKAGES_FOLDER);
  const currentVersions: string[] = [];

  for (const packageJsonPath of packageJsonFiles) {
    const packageJson = readPackageJson(packageJsonPath);
    currentVersions.push(packageJson.version);
  }

  const currentVersion = currentVersions[0] || '0.0.0';

  const nextVersion = prompt(
    `What is the next version? (current: ${currentVersion}): `
  );

  if (!nextVersion) {
    console.error('❌ No version provided. Exiting.');
    process.exit(1);
  }

  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
  if (!semverRegex.test(nextVersion)) {
    console.error(
      '❌ Invalid version format. Please use semantic versioning (e.g., 0.2.8).'
    );
    process.exit(1);
  }

  if (compareVersions(nextVersion, currentVersion) <= 0) {
    console.error(
      `❌ New version ${nextVersion} is not higher than current version ${currentVersion}.`
    );
    console.error('   Please provide a higher version number.');
    process.exit(1);
  }

  if (!createReleaseBranch(nextVersion)) {
    console.error('❌ Failed to create release branch. Exiting.');
    process.exit(1);
  }

  try {
    const packageJsonFiles = findPackageJsonFiles(PACKAGES_FOLDER);

    if (packageJsonFiles.length === 0) {
      console.error('❌ No package.json files found in packages directory.');
      process.exit(1);
    }

    const updatedPackages: string[] = [];

    for (const packageJsonPath of packageJsonFiles) {
      const packageJson = readPackageJson(packageJsonPath);
      const packageName = packageJson.name;

      if (IGNORED_PACKAGES.includes(packageName)) {
        continue;
      }

      const updatedPackageJson = updateVersion(packageJson, nextVersion);

      let finalPackageJson = updatedPackageJson;

      if (packageJson.dependencies) {
        for (const [depName] of Object.entries(packageJson.dependencies)) {
          if (
            depName.startsWith(`@${NPM_ORG_NAME}/`) &&
            depName !== packageName &&
            !IGNORED_PACKAGES.includes(depName)
          ) {
            finalPackageJson = updateDependencyVersion(
              finalPackageJson,
              depName,
              nextVersion
            );
          }
        }
      }

      writePackageJson(packageJsonPath, finalPackageJson);
      updatedPackages.push(packageName);
    }

    const lernaJsonPath = 'lerna.json';
    const lernaJson = readPackageJson(lernaJsonPath);
    lernaJson.version = nextVersion;
    writePackageJson(lernaJsonPath, lernaJson);

    console.log(
      `\n🚀 Successfully updated ${updatedPackages.length} packages to version ${nextVersion}:`
    );
    updatedPackages.forEach(pkg => console.log(`   - ${pkg}`));

    console.log('\n📁 Adding all changes to git...');
    const addResult = Bun.spawnSync(['git', 'add', '.']);
    if (addResult.exitCode !== 0) {
      console.log('⚠️  Git add failed, please add changes manually');
    }

    const commitMessage = `Bump version to ${nextVersion}`;
    console.log(`📝 Committing with message: "${commitMessage}"`);
    const commitResult = Bun.spawnSync(['git', 'commit', '-m', commitMessage]);
    if (commitResult.exitCode !== 0) {
      console.log('⚠️  Git commit failed, please commit manually');
    }

    const releaseBranchName = getReleaseBranchName(nextVersion);

    console.log(`📤 Pushing release branch: ${releaseBranchName}`);
    const pushResult = Bun.spawnSync([
      'git',
      'push',
      'origin',
      releaseBranchName,
    ]);
    if (pushResult.exitCode !== 0) {
      console.log('⚠️  Git push failed, please push manually');
    }

    console.log('\n🎉 Package bump complete!');
    console.log('\n🏁 Next steps:');
    console.log(
      `   1. Create a pull request: ${GITHUB_REPO_URL}/compare/${GIT_MAIN_BRANCH}...${releaseBranchName}?expand=1`
    );
    console.log(`   2. After PR is merged to ${GIT_MAIN_BRANCH}:`);
    console.log(`      - git checkout ${GIT_MAIN_BRANCH}`);
    console.log(`      - git pull origin ${GIT_MAIN_BRANCH}`);
    console.log(`      - git tag v${nextVersion}`);
    console.log(`      - git push origin v${nextVersion}`);
    console.log('   3. Publish the packages');
  } catch (error) {
    console.error('❌ Error updating packages:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
