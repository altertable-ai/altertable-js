# Altertable JavaScript SDK

A modern, type-safe analytics SDK for capturing and sending events to Altertable. Built with TypeScript, featuring React integration and comprehensive developer tooling.

## Packages

| Package                                                           | Description                                                    | NPM                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`@altertable/altertable-js`](./packages/altertable-js)           | Core JavaScript SDK for capturing and sending analytics events | [![npm](https://img.shields.io/npm/v/@altertable/altertable-js)](https://www.npmjs.com/package/@altertable/altertable-js)       |
| [`@altertable/altertable-react`](./packages/altertable-react)     | React SDK with hooks and type-safe funnel tracking             | [![npm](https://img.shields.io/npm/v/@altertable/altertable-react)](https://www.npmjs.com/package/@altertable/altertable-react) |
| [`@altertable/altertable-snippet`](./packages/altertable-snippet) | ES5-compatible snippet for legacy browser support              | –                                                                                                                               |

## Examples

| Example                                     | Description                                  | Port   | Framework                 |
| ------------------------------------------- | -------------------------------------------- | ------ | ------------------------- |
| [`example-react`](./examples/example-react) | React application showcasing funnel tracking | `3000` | React + Vite + TypeScript |

## Quick Start

For detailed installation and usage instructions, see the package-specific documentation:

- **[Core JavaScript SDK](./packages/altertable-js/README.md)** – Installation, API reference, and examples
- **[React SDK](./packages/altertable-react/README.md)** – React hooks, providers, and type-safe funnel tracking

## Development

### Prerequisites

- Install [Bun](https://bun.sh/)

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
| Lint       | `bun run lint:fix`   | Fix code style issues                             |
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
| `lint`         | Run ESLint across all packages                               |
| `lint:fix`     | Fix ESLint issues across all packages                        |
| `test`         | Run tests across all packages                                |
| `test:watch`   | Run tests in watch mode across all packages                  |
| `bump`         | Bump versions across all packages                            |

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

1. Bump versions across all packages: `bun run bump`
2. Open a PR with the changes
3. Merge the PR
4. Push the tag to the repository
5. Run the [Release workflow](https://github.com/altertable-ai/altertable-js/actions/workflows/release.yml) in GitHub Actions

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

[MIT](./packages/altertable-js/LICENSE)

## Links

- [Website](https://altertable.ai)
- [GitHub Repository](https://github.com/altertable-ai/altertable-js)
