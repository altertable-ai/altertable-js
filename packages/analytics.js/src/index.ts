interface Reaping {
  _lastUrl: string;
  checkForChanges(): void;
}

const reaping: Reaping = {
  _lastUrl: window.location.href,

  checkForChanges() {
    const currentUrl = window.location.href;
    if (currentUrl !== this._lastUrl) {
      this._lastUrl = currentUrl;
      // FIXME
    }
  },
};

setInterval(() => {
  reaping.checkForChanges();
}, 100);

window.addEventListener('popstate', () => reaping.checkForChanges());
window.addEventListener('hashchange', () => reaping.checkForChanges());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).Reaping = reaping;
