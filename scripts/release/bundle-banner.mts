import { execSync } from 'child_process';

type PackageJson = {
  name: string;
  version: string;
  license: string;
  author: { name: string };
  homepage: string;
};

export function generateBundleBanner(pkg: PackageJson) {
  const lastCommitHash = execSync('git rev-parse --short HEAD')
    .toString()
    .trim();
  const version = process.env.RELEASING
    ? pkg.version
    : `${pkg.version} (UNRELEASED ${lastCommitHash})`;

  return `/*! ${pkg.name} ${version} | ${pkg.license} License | ${pkg.author.name} | ${pkg.homepage} */`;
}
