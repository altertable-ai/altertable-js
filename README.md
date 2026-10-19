# Altertable JavaScript SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A modern, type-safe analytics SDK for capturing and sending events to Altertable. Built with TypeScript, featuring React integration and comprehensive developer tooling.

## Packages

| Package                                                                     | Description                                                                      | NPM                                                                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`@altertable/altertable-js`](./packages/altertable-js)                     | Core JavaScript SDK for capturing and sending analytics events                   | [![npm](https://img.shields.io/npm/v/@altertable/altertable-js)](https://www.npmjs.com/package/@altertable/altertable-js)       |
| [`@altertable/altertable-react`](./packages/altertable-react)               | React SDK with hooks and type-safe funnel tracking                               | [![npm](https://img.shields.io/npm/v/@altertable/altertable-react)](https://www.npmjs.com/package/@altertable/altertable-react) |
| [`@altertable/altertable-react-native`](./packages/altertable-react-native) | React Native SDK with persistent identity, offline delivery, and screen tracking | –                                                                                                                               |
| [`@altertable/altertable-snippet`](./packages/altertable-snippet)           | ES5-compatible snippet for legacy browser support                                | –                                                                                                                               |

## Examples

| Example                                                   | Description                                                | Port   | Framework                        |
| --------------------------------------------------------- | ---------------------------------------------------------- | ------ | -------------------------------- |
| [`example-react`](./examples/example-react)               | React application showcasing funnel tracking               | `3000` | React + Vite + TypeScript        |
| [`example-react-native`](./examples/example-react-native) | Native identity, offline delivery, and navigation tracking | `8081` | Expo + React Native + TypeScript |

## Quick Start

For detailed installation and usage instructions, see the package-specific documentation:

- **[Core JavaScript SDK](./packages/altertable-js/README.md)** – Installation, API reference, and examples
- **[React SDK](./packages/altertable-react/README.md)** – React hooks, providers, and type-safe funnel tracking
- **[React Native SDK](./packages/altertable-react-native/README.md)** – AsyncStorage, app lifecycle, and screen tracking

## Development

### Prerequisites

- Install Node.js (see [`.node-version`](./.node-version))
- Install Bun (see [`.bun-version`](./.bun-version))

### Setup

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test
```

### Development Workflow

| Step       | Command              | Description                                       |
| ---------- | -------------------- | ------------------------------------------------- |
| Start      | `bun run dev`        | Start all packages and examples in watch mode     |
| Edit       | –                    | Modify files and changes auto-reflect in examples |
| Test       | `bun run test:watch` | Run tests in watch mode                           |
| Lint       | `bun run lint`       | Check code quality                                |
| Type check | `bun run typecheck`  | Verify TypeScript types                           |

### Monorepo Scripts

| Script         | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `dev`          | Start development environment with all packages and examples |
| `dev:packages` | Start development mode for all packages only                 |
| `dev:examples` | Start development mode for all examples only                 |
| `build`        | Build all packages                                           |
| `clean`        | Clean all build artifacts                                    |
| `typecheck`    | Run TypeScript type checking across all packages             |
| `lint`         | Run Oxlint across the monorepo                               |
| `lint:fix`     | Fix Oxlint issues across the monorepo                        |
| `format`       | Format the monorepo with Oxfmt                               |
| `format:check` | Check formatting across the monorepo                         |
| `test`         | Run tests across all packages                                |
| `test:watch`   | Run tests in watch mode across all packages                  |

## Testing

The monorepo uses [Vitest](https://vitest.dev/) for testing:

```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests for a specific package
cd packages/altertable-js && bun run test
```

## Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please):

1. Merge conventional commits into `main` (`fix:` for patch, `feat:` for minor, `feat!:` for major)
2. release-please opens/updates a release PR with version and changelog updates
3. Merge the release PR
4. The `release-please.yml` workflow publishes the SDK packages to npm through trusted publishing

`@altertable/altertable-js`, `@altertable/altertable-react`, and `@altertable/altertable-react-native` share one version and are published together. The workflow fails before publishing if their versions differ or if GitHub OIDC is unavailable. It does not use an `NPM_TOKEN`.

Configure the npm trusted publisher for all three packages with the GitHub organization `altertable-ai`, repository `altertable-js`, workflow filename `release-please.yml`, and the `npm publish` action. The React Native package requires its initial npm package and trusted publisher setup before its first automated release. To recover an existing release, manually run the **Release Please** workflow from `main`. Recovery is retry-safe: versions already present on npm are skipped before each package is attempted.

## Documentation

- [Core SDK Documentation](./packages/altertable-js/README.md)
- [React SDK Documentation](./packages/altertable-react/README.md)
- [API Reference](./packages/altertable-js/README.md#api-reference)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[MIT](./LICENSE)

## Links

- [Website](https://altertable.ai)
- [GitHub Repository](https://github.com/altertable-ai/altertable-js)
