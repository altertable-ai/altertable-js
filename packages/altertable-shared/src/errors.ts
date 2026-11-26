/** Returns `error` when it is an `Error`, otherwise wraps its string form. */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
