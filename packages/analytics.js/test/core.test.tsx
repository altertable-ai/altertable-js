/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { Reaping, Config, PAGEVIEW_EVENT } from '../src/core';

const setWindowLocation = (url: string) => {
  Object.defineProperty(window, 'location', {
    value: { href: url },
    writable: true,
    configurable: true,
  });
};

describe('Reaping with navigator.sendBeacon available', () => {
  let reaping: Reaping;
  const apiKey = 'test-api-key';

  beforeEach(() => {
    setWindowLocation('http://localhost/page');
    global.navigator = {
      sendBeacon: vi.fn(),
    } as any;

    global.fetch = undefined as any;

    reaping = new Reaping();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should send a page event on init with the current URL', () => {
    const config: Config = { baseUrl: 'http://localhost', autoCapture: true };
    reaping.init(apiKey, config);

    // The init() method automatically calls page() if autoCapture is not false.
    expect(navigator.sendBeacon).toHaveBeenCalled();

    const expectedBeaconUrl = `${config.baseUrl}/1/track?apiKey=${encodeURIComponent(apiKey)}`;
    const callArgs = (navigator.sendBeacon as Mock).mock.calls[0];
    expect(callArgs[0]).toBe(expectedBeaconUrl);
    expect(callArgs[1]).toBeInstanceOf(Blob);
  });

  it('should send a track event', () => {
    const config: Config = { baseUrl: 'http://localhost', autoCapture: false };
    reaping.init(apiKey, config);

    reaping.track('eventName', { foo: 'bar' });
    const expectedBeaconUrl = `${config.baseUrl}/1/track?apiKey=${encodeURIComponent(apiKey)}`;
    const callArgs = (navigator.sendBeacon as Mock).mock.calls[0];
    expect(callArgs[0]).toBe(expectedBeaconUrl);
    expect(callArgs[1]).toBeInstanceOf(Blob);
  });

  it('should detect URL changes and send a page event', () => {
    vi.useFakeTimers();
    const config: Config = { baseUrl: 'http://localhost', autoCapture: true };

    reaping.init(apiKey, config);
    (navigator.sendBeacon as Mock).mockClear(); // initial page event

    // Simulate a URL change.
    setWindowLocation('http://localhost/new-page');
    vi.advanceTimersByTime(101);

    const expectedBeaconUrl = `${config.baseUrl}/1/track?apiKey=${encodeURIComponent(apiKey)}`;
    const callArgs = (navigator.sendBeacon as Mock).mock.calls[0];
    expect(callArgs[0]).toBe(expectedBeaconUrl);

    // Also test that a manual event (popstate) triggers a check.
    (navigator.sendBeacon as Mock).mockClear();
    window.dispatchEvent(new Event('popstate'));
    const callArgs2 = (navigator.sendBeacon as Mock).mock.calls[0];
    expect(callArgs2[0]).toBe(expectedBeaconUrl);

    vi.useRealTimers();
  });

  it('should not auto-capture when config.autoCapture is false', () => {
    reaping.init(apiKey, { baseUrl: 'http://localhost', autoCapture: false });
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });
});

describe('Reaping with fetch fallback (navigator.sendBeacon not available)', () => {
  let reaping: Reaping;
  const apiKey = 'test-api-key';

  beforeEach(() => {
    setWindowLocation('http://localhost/page');

    // Simulate that sendBeacon is not available.
    if ('sendBeacon' in navigator) {
      delete (navigator as any).sendBeacon;
    }
    // Set up a spy for fetch.
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    ) as any;

    reaping = new Reaping();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should send a page event on init using fetch', () => {
    const config: Config = { baseUrl: 'http://localhost', autoCapture: true };
    reaping.init(apiKey, config);

    const expectedUrl = `${config.baseUrl}/1/track`;
    expect(fetch).toHaveBeenCalled();

    const fetchCall = (fetch as Mock).mock.calls[0];
    expect(fetchCall[0]).toBe(expectedUrl);

    const options = fetchCall[1];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(options.body).toBe(
      JSON.stringify({
        event: PAGEVIEW_EVENT,
        properties: { url: 'http://localhost/page' },
      })
    );
  });

  it('should send a track event using fetch', () => {
    const config: Config = { baseUrl: 'http://localhost', autoCapture: false };
    reaping.init(apiKey, config);

    reaping.track('eventName', { foo: 'bar' });
    const expectedUrl = `${config.baseUrl}/1/track`;
    expect(fetch).toHaveBeenCalled();

    const fetchCall = (fetch as Mock).mock.calls[0];
    expect(fetchCall[0]).toBe(expectedUrl);

    const options = fetchCall[1];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(options.body).toBe(
      JSON.stringify({ event: 'eventName', properties: { foo: 'bar' } })
    );
  });

  it('should detect URL changes and send a page event using fetch', () => {
    vi.useFakeTimers();
    const config: Config = { baseUrl: 'http://localhost', autoCapture: true };
    reaping.init(apiKey, config);
    (fetch as Mock).mockClear();

    // Simulate a URL change.
    setWindowLocation('http://localhost/new-page');
    vi.advanceTimersByTime(101);

    const expectedUrl = `${config.baseUrl}/1/track`;
    expect(fetch).toHaveBeenCalled();
    const fetchCall = (fetch as Mock).mock.calls[0];
    expect(fetchCall[0]).toBe(expectedUrl);

    const options = fetchCall[1];
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(options.body).toBe(
      JSON.stringify({
        event: PAGEVIEW_EVENT,
        properties: { url: 'http://localhost/new-page' },
      })
    );

    vi.useRealTimers();
  });

  it('should not auto-capture when config.autoCapture is false (using fetch)', () => {
    reaping.init(apiKey, { baseUrl: 'http://localhost', autoCapture: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
