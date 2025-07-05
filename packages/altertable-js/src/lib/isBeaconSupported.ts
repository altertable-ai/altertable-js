export function isBeaconSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function'
  );
}
