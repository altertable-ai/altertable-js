/* oxlint-disable no-console */

export type Logger = ReturnType<typeof createLogger>;

/** Messages already printed, shared by every logger so each prints once. */
export const loggerCache = new Set<string>();

/** Creates the logger shared by the SDK packages. */
export function createLogger(prefix: string) {
  /**
   * Prints a warning once. A warning that comes with an error is printed once
   * per distinct error message.
   */
  function warnOnce(message: string, error?: Error) {
    const sanitizedMessage = message.trim();
    const key = error
      ? `${sanitizedMessage}\n${error.message}`
      : sanitizedMessage;

    if (loggerCache.has(key)) {
      return;
    }

    loggerCache.add(key);
    const warning = `[${prefix}] ${sanitizedMessage}`;
    console.warn(warning, ...(error ? [error] : []));

    try {
      // This error is thrown so that you can find the source of the warning
      // by enabling "Pause on exceptions" in your debugger.
      throw new Error(warning);
    } catch {
      // Do nothing.
    }
  }

  return {
    log: (...args: unknown[]) => {
      console.log(`[${prefix}]`, ...args);
    },
    warn: (...args: unknown[]) => {
      console.warn(`[${prefix}]`, ...args);
    },
    warnOnce,
    /**
     * Prints a warning once, unless the app is built for production. The app's
     * bundler replaces `process.env.NODE_ENV` and drops this in production.
     */
    warnDev: (message: string, error?: Error) => {
      if (process.env.NODE_ENV !== 'production') {
        warnOnce(message, error);
      }
    },
    error: (...args: unknown[]) => {
      console.error(`[${prefix}]`, ...args);
    },
  };
}
