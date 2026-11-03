import { AUTO_CAPTURE_INTERVAL_MS } from '../constants';
import { safelyRunOnBrowser } from '../lib/safelyRunOnBrowser';
import type { Platform } from './types';

/** Browser capabilities are discovered when used, so importing during SSR is safe. */
export const browserPlatform: Platform = {
  sendOnExit({ url, body, ...options }) {
    try {
      if (
        options.credentials === undefined &&
        options.referrerPolicy === undefined &&
        typeof globalThis.navigator?.sendBeacon === 'function' &&
        globalThis.navigator.sendBeacon(
          url,
          new Blob([body], { type: 'application/json' })
        )
      ) {
        return;
      }
    } catch {
      // A rejected beacon still permits a keepalive request.
    }
    void fetch(url, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  },
  getContext() {
    return safelyRunOnBrowser(
      ({ window }) => ({
        url: window.location.href || null,
        referrer: window.document.referrer || null,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      }),
      () => ({})
    );
  },
  isOnline() {
    return safelyRunOnBrowser(
      ({ window }) => window.navigator?.onLine !== false,
      () => true
    );
  },
  subscribeUrlChanges(listener) {
    return safelyRunOnBrowser(
      ({ window }) => {
        let lastUrl = window.location.href;
        const checkForChanges = () => {
          const url = window.location.href;
          if (url !== lastUrl) {
            lastUrl = url;
            listener(url);
          }
        };
        const interval = setInterval(checkForChanges, AUTO_CAPTURE_INTERVAL_MS);
        window.addEventListener('popstate', checkForChanges);
        window.addEventListener('hashchange', checkForChanges);
        return () => {
          clearInterval(interval);
          window.removeEventListener('popstate', checkForChanges);
          window.removeEventListener('hashchange', checkForChanges);
        };
      },
      () => () => {}
    );
  },
  subscribeLifecycle(listener) {
    return safelyRunOnBrowser(
      ({ window }) => {
        const visibilityChange = () => {
          listener(
            window.document.visibilityState === 'hidden' ? 'exit' : 'active'
          );
        };
        const online = () => listener('online');
        const pageHide = () => listener('exit');
        const pageShow = () => listener('active');
        window.document.addEventListener('visibilitychange', visibilityChange);
        window.addEventListener('online', online);
        window.addEventListener('pagehide', pageHide);
        window.addEventListener('pageshow', pageShow);
        return () => {
          window.document.removeEventListener(
            'visibilitychange',
            visibilityChange
          );
          window.removeEventListener('online', online);
          window.removeEventListener('pagehide', pageHide);
          window.removeEventListener('pageshow', pageShow);
        };
      },
      () => () => {}
    );
  },
};
