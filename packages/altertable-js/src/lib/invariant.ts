/**
 * Throws an error if the condition is not met.
 *
 * The error is exhaustive in development, and becomes generic in production.
 *
 * This is used to make development a better experience to provide guidance as
 * to where the error comes from.
 */
export function invariant(
  condition: unknown,
  message: string | (() => string)
): asserts condition {
  if (condition) {
    return;
  }

  throw new InvariantError(
    `[Altertable] ${typeof message === 'function' ? message() : message}`
  );
}

class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, InvariantError.prototype);
  }
}
