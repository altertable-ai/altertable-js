export function isBeaconSupported(): boolean {
  return (
    typeof globalThis.window !== 'undefined' &&
    typeof globalThis.navigator !== 'undefined' &&
    typeof globalThis.navigator.sendBeacon === 'function'
  );
}
