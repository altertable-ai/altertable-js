/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, MockInstance, test, vi } from 'vitest';

describe('analytics.js', () => {
  let track: MockInstance;
  let init: MockInstance;
  let page: MockInstance;

  beforeEach(async () => {
    delete (window as any).Reaping;
    vi.resetModules();

    const { Reaping } = await import('../src/core');
    init = vi.spyOn(Reaping.prototype, 'init');
    page = vi.spyOn(Reaping.prototype, 'page');
    track = vi.spyOn(Reaping.prototype, 'track');

    (Reaping.prototype as any)._request = vi.fn(); // ensure no network requests
  });

  test('tracks', async () => {
    const { reaping: instance } = await import('../src');
    expect(track).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
    expect(page).not.toHaveBeenCalled();

    instance.init('key', {
      baseUrl: 'https://api.reaping.ai',
      autoCapture: false,
    });
    expect(init).toHaveBeenCalledWith('key', {
      baseUrl: 'https://api.reaping.ai',
      autoCapture: false,
    });

    instance.track('event', { prop: 'value' });
    expect(track).toHaveBeenCalledWith('event', { prop: 'value' });

    instance.page('url');
    expect(page).toHaveBeenCalledWith('url');
  });

  test('auto captures', async () => {
    const { reaping: instance } = await import('../src');
    instance.init('key', { baseUrl: 'https://api.reaping.ai' });
    expect(page).toHaveBeenCalledWith(window.location.href);
  });

  test('replays stubbed', async () => {
    const stub = [
      [
        'init',
        'key',
        { baseUrl: 'https://api.reaping.ai', autoCapture: false },
      ],
      ['page', 'url'],
      ['page', 'url2'],
      ['track', 'event', { prop: 'value' }],
    ];
    (window as any).Reaping = stub;
    const { reaping: instance } = await import('../src');
    expect((window as any).Reaping).toBe(instance);
    expect(init).toHaveBeenCalledWith('key', {
      baseUrl: 'https://api.reaping.ai',
      autoCapture: false,
    });
    expect(page).toHaveBeenCalledWith('url');
    expect(page).toHaveBeenCalledWith('url2');
    expect(track).toHaveBeenCalledWith('event', { prop: 'value' });
  });
});
