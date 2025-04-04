/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, MockInstance, test, vi } from 'vitest';

describe('analytics.js', () => {
  let track: MockInstance;
  let init: MockInstance;
  let page: MockInstance;

  beforeEach(async () => {
    delete (window as any).Altertable;
    vi.resetModules();

    const { Altertable } = await import('../src/core');
    init = vi.spyOn(Altertable.prototype, 'init');
    page = vi.spyOn(Altertable.prototype, 'page');
    track = vi.spyOn(Altertable.prototype, 'track');

    (Altertable.prototype as any)._request = vi.fn(); // ensure no network requests
  });

  test('tracks', async () => {
    const { altertable: instance } = await import('../src');
    expect(track).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
    expect(page).not.toHaveBeenCalled();

    instance.init('key', {
      baseUrl: 'https://api.altertable.ai',
      autoCapture: false,
    });
    expect(init).toHaveBeenCalledWith('key', {
      baseUrl: 'https://api.altertable.ai',
      autoCapture: false,
    });

    instance.track('event', { prop: 'value' });
    expect(track).toHaveBeenCalledWith('event', { prop: 'value' });

    instance.page('https://altertable.ai');
    expect(page).toHaveBeenCalledWith('https://altertable.ai');
  });

  test('auto captures', async () => {
    const { altertable: instance } = await import('../src');
    instance.init('key', { baseUrl: 'https://api.altertable.ai' });
    expect(page).toHaveBeenCalledWith(window.location.href);
  });

  test('replays stubbed', async () => {
    const stub = [
      [
        'init',
        'key',
        { baseUrl: 'https://api.altertable.ai', autoCapture: false },
      ],
      ['page', 'https://altertable.ai'],
      ['page', 'https://example.com'],
      ['track', 'event', { prop: 'value' }],
    ];
    (window as any).Altertable = stub;
    const { altertable: instance } = await import('../src');
    expect((window as any).Altertable).toBe(instance);
    expect(init).toHaveBeenCalledWith('key', {
      baseUrl: 'https://api.altertable.ai',
      autoCapture: false,
    });
    expect(page).toHaveBeenCalledWith('https://altertable.ai');
    expect(page).toHaveBeenCalledWith('https://example.com');
    expect(track).toHaveBeenCalledWith('event', { prop: 'value' });
  });
});
