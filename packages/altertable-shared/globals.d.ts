// Replaced at build time by the package that bundles this module, so events
// report that package's name and version.
declare const __LIB__: string;
declare const __LIB_VERSION__: string;
// Replaced by the app's bundler, like React does. Declared here because this
// module must not depend on Node types.
declare const process: { env: { NODE_ENV?: string } };

// Every runtime the SDK supports provides `console`, but the ECMAScript library
// types don't declare it, and this module must not depend on DOM or Node types.
declare const console: {
  log(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
  groupCollapsed(...data: unknown[]): void;
  groupEnd(): void;
  table(data: unknown): void;
};
