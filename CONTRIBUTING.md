# Contributing to @altertable/altertable-js and @altertable/altertable-react

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun run test`

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Add or update tests
4. Run the full check suite: `bun run build && bun run typecheck && bun run lint && bun run test`
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.)
6. Open a pull request

## Code Style

This project uses `ESLint` for linting and `Prettier` for formatting. Run `bun run lint` before committing.

## Tests

- Unit tests are required for all new functionality
- Integration tests run in CI when credentials are available
- Run tests locally: `bun run test`

## Pull Requests

- Keep PRs focused on a single change
- Update `CHANGELOG.md` under `[Unreleased]`
- Ensure CI passes before requesting review
