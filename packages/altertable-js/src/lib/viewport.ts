import { safelyRunOnBrowser } from './safelyRunOnBrowser';

export function getViewport(): string | null {
  return safelyRunOnBrowser<string | null>(
    ({ window }) => `${window.innerWidth}x${window.innerHeight}`,
    () => null
  );
}
