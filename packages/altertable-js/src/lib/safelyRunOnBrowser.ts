/** Runs code on browser environments safely. */
export function safelyRunOnBrowser<TReturn>(
  callback: (params: { window: typeof globalThis.window }) => TReturn,
  /** Fallback to run in non-browser environments, including React Native. */
  fallback: () => TReturn = () => undefined as unknown as TReturn
): TReturn {
  // React Native exposes window as an alias for globalThis without browser APIs.
  if (
    typeof globalThis.window === 'undefined' ||
    !globalThis.window.document ||
    !globalThis.window.location
  ) {
    return fallback();
  }

  return callback({ window: globalThis.window });
}
