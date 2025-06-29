import { execSync } from 'child_process';

type PackageJson =
  | typeof import('@altertable/altertable-js/package.json')
  | typeof import('@altertable/altertable-react/package.json')
  | typeof import('@altertable/altertable-snippet/package.json');

export function generateBundleBanner(pkg: PackageJson) {
  const lastCommitHash = execSync('git rev-parse --short HEAD')
    .toString()
    .trim();
  const version = process.env.RELEASING
    ? pkg.version
    : `${pkg.version} (UNRELEASED ${lastCommitHash})`;

  return `/*! ${pkg.name} ${version} | ${pkg.license} License | ${pkg.author.name} | ${pkg.homepage} */`;
}
