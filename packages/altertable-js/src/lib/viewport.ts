import { safelyRunOnBrowser } from './safelyRunOnBrowser';

export type PropertyViewport = string | null;

export function getViewport(): PropertyViewport {
  return safelyRunOnBrowser<PropertyViewport>(
    ({ window }) => `${window.innerWidth}x${window.innerHeight}`,
    () => null
  );
}
