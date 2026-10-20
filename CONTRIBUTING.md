# Contributing to @altertable/altertable-js and @altertable/altertable-react

## Development Setup

1. Fork and clone the repository
2. Use Bun 1.4.3 and Node 24.18.0 (see `.bun-version` and `.node-version`). Install dependencies: `bun install`
3. Run tests: `bun run test`

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Add or update tests
4. Run the full check suite: `bun run check`
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.)
6. Open a pull request

## Code Style

This project uses Oxlint for linting and Oxfmt for formatting. Run `bun run lint` before committing; use `bun run lint:fix` to apply available lint fixes and `bun run format` to format.

## Tests

- Unit tests are required for all new functionality
- Integration tests run in CI when credentials are available
- Run tests locally: `bun run test`

## Pull Requests

- Keep PRs focused on a single change
- Update `CHANGELOG.md` under `[Unreleased]`
- Ensure CI passes before requesting review

## Workspace tooling

`bun run build` builds workspaces in dependency order, including the React and
Expo examples. `bun run dev` builds once before starting all watchers; use
`dev:packages` or `dev:examples` to select a subset. `bun run test` exits after
running tests; `bun run test:watch` keeps watching.

`bun run check` runs builds, typechecking, linting, Knip, formatting, tests, and
`check:package`. Workspace dependency installation stays separate. `check:package` preserves
the gzip budgets, parses the snippet as ES5, executes the browser global, and
qualifies packed core/React consumers with React 16.14 and current React, using
maintained type definitions for each React major. Each consumer checks Node
imports, browser ESM bundling, and TypeScript NodeNext/Bundler resolution from
an isolated installation. Node selects the core/React SDK CJS builds for React
16.14 interoperability and a shared singleton;
browser bundlers select ESM. Native packed-consumer checks remain separate:

```fish
bun run check:react-native minimum
bun run check:react-native current
```

Typechecking and declaration generation use TypeScript 7.0.2. Package scripts
use `tsc --noEmit`; source-only build configs keep test helpers out of declarations.
tsdown currently labels its TypeScript 7 API experimental; packed-consumer checks
verify the emitted declarations. The local TypeScript and Vitest base configs
hold shared defaults; native platform settings remain in their package.

Strict checking is enabled in the shared TypeScript base and retained by each
platform overlay. The root project also checks scripts and integration tests.
Type-aware lint rules run with strict null checking enabled.
Tests that deliberately exercise malformed JavaScript inputs mark only those
specific invalid arguments with `@ts-expect-error`, preserving the public types.

SDK and Segment builds use upstream tsdown directly, with explicit targets and
output names. The snippet uses the SWC CLI directly because tsdown/Rolldown
reject ES5 targets. Its config preserves the IIFE boundary to avoid global names.
Preserve all public formats, global filenames, platform exports, and runtime
limits when revisiting that exception.

`bun run knip` checks unused files, exports, and dependencies across the SDK
workspaces, examples, tests, and scripts. Its built-in tsdown, Vitest, Vite, SWC,
and Expo plugins discover normal entry points and preserve package entry exports.
`knip.jsonc` adds the native fixture copied into temporary installations and
records its dynamically installed runtime plus the Expo plugin's optional OTA
updates assumption.
