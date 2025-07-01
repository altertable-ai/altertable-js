export function generateId(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    try {
      return `${prefix}-${crypto.randomUUID()}`;
    } catch {
      // Continue with Math.random() fallback.
    }
  }
  return `${prefix}-${Math.random().toString(36).substring(2)}`;
}
