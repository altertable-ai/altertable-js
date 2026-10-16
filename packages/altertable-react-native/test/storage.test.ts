import { expect, it, vi } from 'vitest';

import { hydrateStorage } from '../src/storage';
import { createBackend, deferred } from './helpers';

it('hydrates before exposing synchronous reads', async () => {
  const backend = createBackend();
  backend.values.set('identity', 'saved');
  const storage = await hydrateStorage(backend, ['identity'], vi.fn());
  expect(storage.getItem('identity')).toBe('saved');
  expect(storage.getItem('missing')).toBeNull();
});

it('orders writes and deletes without resurrecting an older value', async () => {
  const backend = createBackend();
  const firstWrite = deferred<void>();
  backend.setItem.mockImplementationOnce(async (key, value) => {
    await firstWrite.promise;
    backend.values.set(key, value);
  });
  const storage = await hydrateStorage(backend, [], vi.fn());
  storage.setItem('identity', 'old');
  await Promise.resolve();
  storage.setItem('identity', 'new');
  storage.removeItem('identity');
  const flush = storage.flush();
  expect(backend.removeItem).not.toHaveBeenCalled();
  expect(storage.getItem('identity')).toBeNull();
  firstWrite.resolve();
  await flush;
  expect(backend.values.has('identity')).toBe(false);
});

it('reports a failed write and retries the latest pending value on flush', async () => {
  const backend = createBackend();
  const onError = vi.fn();
  const error = new Error('Disk full');
  backend.setItem.mockRejectedValueOnce(error);
  const storage = await hydrateStorage(backend, [], onError);
  storage.setItem('identity', 'saved');
  await expect(storage.flush()).rejects.toThrow('Disk full');
  expect(onError).toHaveBeenCalledWith(error);
  await storage.flush();
  expect(backend.values.get('identity')).toBe('saved');
});

it('does not retry a failed stale snapshot over a newer deletion', async () => {
  const backend = createBackend();
  const write = deferred<void>();
  backend.setItem.mockImplementationOnce(() => write.promise);
  const storage = await hydrateStorage(backend, [], vi.fn());
  storage.setItem('events', 'old');
  await Promise.resolve();
  storage.removeItem('events');
  const flush = storage.flush();
  write.reject(new Error('Write failed'));
  await expect(flush).rejects.toThrow('Write failed');
  await storage.flush();
  expect(backend.removeItem).toHaveBeenCalledWith('events');
  expect(backend.setItem).toHaveBeenCalledTimes(1);
});

it('fails hydration without creating a replacement identity', async () => {
  const backend = createBackend();
  backend.getItem.mockRejectedValue(new Error('Read failed'));
  await expect(hydrateStorage(backend, ['identity'], vi.fn())).rejects.toThrow(
    'Read failed'
  );
  expect(backend.setItem).not.toHaveBeenCalled();
});

it('ignores late writes from disposed clients', async () => {
  const backend = createBackend();
  const storage = await hydrateStorage(backend, [], vi.fn());
  storage.setItem('events', 'in-flight');
  await storage.close();
  storage.removeItem('events');
  await storage.flush();
  expect(backend.values.get('events')).toBe('in-flight');
});
