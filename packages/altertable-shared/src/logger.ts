/**
 * Creates the logger shared by the SDK packages. Pass `printedWarnings` to share
 * `warnOnce()` deduplication between loggers.
 */
export function createLogger(
  prefix: string,
  printedWarnings = new Set<string>()
) {
  return {
    /**
     * Prints a warning once. A warning that comes with an error is printed once
     * per distinct error message.
     */
    warnOnce(message: string, error?: Error) {
      const sanitizedMessage = message.trim();
      const key = error
        ? `${sanitizedMessage}\n${error.message}`
        : sanitizedMessage;

      if (printedWarnings.has(key)) {
        return;
      }

      printedWarnings.add(key);
      const warning = `[${prefix}] ${sanitizedMessage}`;
      // oxlint-disable-next-line no-console
      console.warn(warning, ...(error ? [error] : []));

      try {
        // This error is thrown so that you can find the source of the warning
        // by enabling "Pause on exceptions" in your debugger.
        throw new Error(warning);
      } catch {
        // Do nothing.
      }
    },
  };
}
