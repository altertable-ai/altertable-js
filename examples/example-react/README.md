# Altertable React Example

A React application demonstrating `@altertable/altertable-react` usage with type-safe funnel tracking.

## Quick Start

```bash
cd examples/example-react
bun install
bun run dev
```

Open `http://localhost:3000` to see the example.

## Features

- Type-safe funnel tracking with TypeScript
- User identification
- Funnel-specific tracking functions
- Environment-based configuration (dev/prod)

## Configuration

The example uses different API keys and endpoints for development/production environments, configured in `vite.config.ts` and declared in `src/vite-env.d.ts`.

## Build

```bash
bun run build
```
