# Contributing to @altertable/altertable-js and @altertable/altertable-react

## Development Setup

1. Fork and clone the repository
2. Use Bun 1.4.2 and Node 24.18.0 (see `.bun-version` and `.node-version`). Install dependencies: `bun install`
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

`bun run check` runs builds, typechecking, linting, formatting, tests, and
`check:package`. Workspace dependency installation stays separate. `check:package` preserves
the gzip budgets, parses the snippet as ES5, executes the browser global, and
qualifies packed core/React consumers with React 16.8 and current React. Each
consumer checks CJS/ESM execution and TypeScript NodeNext/Bundler resolution from
an isolated installation. Native packed-consumer checks remain separate:

```fish
bun run check:react-native minimum
bun run check:react-native current
```

Typechecking uses TypeScript 7.0.2 through the `typescript-check` alias. Package
scripts invoke that compiler directly because its `tsc` binary conflicts with
the legacy compiler's binary. TypeScript 5.9.3 remains installed for the build
tools' stable compiler API and declaration generation; package typechecking and
consumer qualifications use TypeScript 7. The local TypeScript and Vitest base
configs hold shared defaults; native platform settings remain in their package.
TypeScript 7 defaults to strict checking, so the base explicitly preserves the
previous strictness of core/React; the native and Segment overlays stay strict.
The nullability-dependent `no-useless-default-assignment` lint rule is disabled
only in those non-strict packages and their shared test helpers.

SDK and Segment builds use upstream tsdown directly, with explicit targets and
output names. The snippet alone retains tsup and SWC because tsdown/Rolldown
reject ES5 targets. Preserve all public formats, global filenames, platform
exports, and runtime limits when revisiting that exception.
