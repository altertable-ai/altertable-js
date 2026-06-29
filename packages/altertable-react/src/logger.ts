const warnedMessages = new Set<string>();

// Keep React warnings local for now. Importing the core package logger would
// make React tests depend on the core package being rebuilt first in workspace
// development, because package resolution reads the built core entrypoints.
export const logger = {
  warnOnce(message: string) {
    const sanitizedMessage = message.trim();

    if (warnedMessages.has(sanitizedMessage)) {
      return;
    }

    warnedMessages.add(sanitizedMessage);
    // eslint-disable-next-line no-console
    console.warn(`[Altertable React] ${sanitizedMessage}`);
  },
};
