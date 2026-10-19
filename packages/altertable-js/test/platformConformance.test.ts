import { vi } from 'vitest';

import {
  platformConformanceTests,
  type PlatformConformanceDriver,
} from '../../../test-utils/platformConformance';
import { createPlatformRuntime } from '../../../test-utils/platformRuntime';
import { Altertable, browserPlatform } from '../src';

platformConformanceTests(
  'synchronous runtime',
  createPlatformRuntime,
  platform => new Altertable(platform)
);
platformConformanceTests(
  'asynchronous runtime',
  () => {
    const runtime = createPlatformRuntime();
    runtime.platform.prepareDelivery = async () => {};
    return runtime;
  },
  platform => new Altertable(platform)
);

platformConformanceTests(
  'browser',
  (): PlatformConformanceDriver => {
    let cleanupError: Error | undefined;
    let staleOnlineListeners: Array<EventListenerOrEventListenerObject> = [];
    const removeWindowListener = window.removeEventListener.bind(window);
    const removeDocumentListener = document.removeEventListener.bind(document);
    const windowAdds = vi.spyOn(window, 'addEventListener');
    const documentAdds = vi.spyOn(document, 'addEventListener');
    vi.spyOn(window, 'removeEventListener').mockImplementation((...args) => {
      if (cleanupError) throw cleanupError;
      removeWindowListener(...args);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((...args) => {
      if (cleanupError) throw cleanupError;
      removeDocumentListener(...args);
    });
    return {
      platform: browserPlatform,
      homeUrl: new URL('/home', window.location.href).href,
      navigate(url) {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new Event('popstate'));
      },
      setCleanupError(error) {
        staleOnlineListeners = windowAdds.mock.calls
          .filter(([event]) => event === 'online')
          .map(([, listener]) => listener);
        cleanupError = error;
      },
      emitStale(event) {
        for (const listener of staleOnlineListeners) {
          if (typeof listener === 'function')
            listener.call(window, new Event(event));
          else listener.handleEvent(new Event(event));
        }
      },
      destroy() {
        for (const args of windowAdds.mock.calls) removeWindowListener(...args);
        for (const args of documentAdds.mock.calls)
          removeDocumentListener(...args);
      },
    };
  },
  platform => new Altertable(platform)
);
