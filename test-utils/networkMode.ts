import { vi } from 'vitest';

function getMockedFetch() {
  return vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, statusText: 'OK' })
  );
}

export function setupBeaconAvailable() {
  (global.navigator as any).sendBeacon = vi.fn(() => true);
  (global.fetch as any) = getMockedFetch();
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).fetch = global.fetch;
  }
}

export function setupBeaconUnavailable() {
  delete (global.navigator as any).sendBeacon;
  (global.fetch as any) = getMockedFetch();
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).fetch = global.fetch;
  }
}
