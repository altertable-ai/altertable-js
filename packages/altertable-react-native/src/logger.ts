/** Keep repeated native failures visible without flooding the console on every retry. */
export function createLogger() {
  const warnedErrors = new Set<string>();

  return {
    warnOnce(message: string, error: Error) {
      const key = `${message}\n${error.message}`;
      if (warnedErrors.has(key)) {
        return;
      }

      warnedErrors.add(key);
      // oxlint-disable-next-line no-console
      console.warn(`[Altertable React Native] ${message}`, error);
    },
  };
}
