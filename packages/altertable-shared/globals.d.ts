// Replaced at build time by the package that bundles this module, so events
// report that package's name and version.
declare const __LIB__: string;
declare const __LIB_VERSION__: string;

// Every runtime the SDK supports provides `console`, but the ECMAScript library
// types don't declare it, and this module must not depend on DOM or Node types.
declare const console: { warn(...data: unknown[]): void };
