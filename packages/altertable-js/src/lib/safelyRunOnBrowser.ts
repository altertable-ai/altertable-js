/** Runs code on browser environments safely. */
export function safelyRunOnBrowser<TReturn>(
  callback: (params: { window: typeof window }) => TReturn,
  /** Fallback to run on server environments. */
  fallback: () => TReturn = () => undefined as unknown as TReturn
): TReturn {
  if (typeof window === 'undefined') {
    return fallback();
  }

  return callback({ window });
}
