import type {
  Platform,
  PlatformContext,
  PlatformLifecycleEvent,
} from '../packages/altertable-js/src/platform/types';

/** A controllable external runtime for public platform behavior tests. */
export function createPlatformRuntime() {
  let context: PlatformContext = {};
  let online = true;
  let cleanupError: Error | undefined;
  const lifecycle = new Set<(event: PlatformLifecycleEvent) => void>();
  const navigation = new Set<(url: string) => void>();
  let staleLifecycle: Array<(event: PlatformLifecycleEvent) => void> = [];
  const platform: Platform = {
    getContext: () => context,
    isOnline: () => online,
    subscribeLifecycle(listener) {
      lifecycle.add(listener);
      return () => {
        if (cleanupError) throw cleanupError;
        lifecycle.delete(listener);
      };
    },
    subscribeUrlChanges(listener) {
      navigation.add(listener);
      return () => {
        if (cleanupError) throw cleanupError;
        navigation.delete(listener);
      };
    },
  };
  return {
    platform,
    homeUrl: 'http://localhost:3000/home',
    setContext(value: PlatformContext) {
      context = value;
    },
    setOnline(value: boolean) {
      online = value;
    },
    setCleanupError(error?: Error) {
      staleLifecycle = [...lifecycle];
      cleanupError = error;
    },
    emit(event: PlatformLifecycleEvent) {
      [...lifecycle].forEach(listener => listener(event));
    },
    emitStale(event: PlatformLifecycleEvent) {
      staleLifecycle.forEach(listener => listener(event));
    },
    navigate(url: string) {
      context = { ...context, url };
      [...navigation].forEach(listener => listener(url));
    },
    destroy() {
      lifecycle.clear();
      navigation.clear();
    },
  };
}
