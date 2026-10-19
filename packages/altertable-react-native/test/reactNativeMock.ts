import { vi } from 'vitest';

type State = 'active' | 'inactive' | 'background';
const listeners = new Set<(state: State) => void>();

export const AppState = {
  currentState: 'active',
  addEventListener: vi.fn(
    (_event: string, listener: (state: State) => void) => {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    }
  ),
};
export const Platform = { OS: 'ios', Version: '18.0' };
export function emitAppState(state: State) {
  for (const listener of listeners) listener(state);
}
export function appStateListenerCount() {
  return listeners.size;
}
