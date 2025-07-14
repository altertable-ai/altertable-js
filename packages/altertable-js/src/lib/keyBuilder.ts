export function createKeyBuilder(prefix: string, separator: string) {
  return (...parts: string[]) => {
    return [prefix, ...parts].join(separator);
  };
}
