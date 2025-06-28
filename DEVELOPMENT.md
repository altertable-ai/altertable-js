# Development Guide

This monorepo is set up for optimal development experience with automatic change reflection between packages and examples.

## Quick Start

```bash
# Install dependencies
bun install

# Start full development environment
bun run dev
```

This will:

- Build all packages in watch mode
- Start all examples in development mode
- Automatically reflect changes from packages to examples

## Development Workflows

### Full Development Environment

```bash
bun run dev
```

Starts everything: packages building in watch mode + examples running.

### Packages Only

```bash
bun run dev:packages
```

Builds only the packages in watch mode.

### Examples Only

```bash
bun run dev:examples
```

Runs only the examples (requires packages to be built first).

### Individual Example Development

```bash
cd examples/example-react
bun run dev
```

## How It Works

### Workspace Dependencies

- Examples use `workspace:*` dependencies to reference local packages
- Changes to packages are automatically reflected in examples
- No need to publish packages or manually link them

### Watch Mode

- Examples run in development mode with hot reload
- Changes propagate automatically through the workspace

### Lerna Integration

- Lerna manages both packages and examples
- Parallel execution for faster development
- Consistent versioning across the monorepo

## Available Scripts

### Root Level

- `bun run dev` - Full development environment
- `bun run build` - Build all packages
- `bun run test` - Run all tests
- `bun run test:watch` - Run all tests in watch mode
- `bun run lint` - Lint all packages and examples
- `bun run clean` - Clean all build artifacts

### Package Level

- `bun run build` - Build the package
- `bun run test` - Run tests
- `bun run test:watch` - Run tests in watch mode
- `bun run lint` - Lint the package

### Example Level

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build

## Development Tips

1. **Start with `bun run dev`** - This gives you the full development experience
2. **Make changes to packages** - They'll automatically rebuild and be available to examples
3. **Test in examples** - Examples will hot reload with the latest package changes
4. **Use TypeScript** - Full type safety across the monorepo
5. **Check the console** - The dev script provides colored output for each process

## Troubleshooting

### Examples not picking up package changes

- Ensure packages are building in watch mode
- Check that examples are using `workspace:*` dependencies
- Restart the development environment

### Build errors

- Run `bun run clean` to clear build artifacts
- Check TypeScript errors with `bun run lint`
- Ensure all dependencies are installed with `bun install`

### Performance issues

- Use `bun run dev:packages` if you only need to work on packages
- Use `bun run dev:examples` if you only need to work on examples
- Individual package development can be faster for focused work
