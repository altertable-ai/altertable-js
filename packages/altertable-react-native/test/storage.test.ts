import { expect, it, vi } from 'vitest';

import { hydrateStorage } from '../src/storage';
import { createAsyncStorageMock, deferred } from './helpers';

it('hydrates before exposing synchronous reads', async () => {
  const storageMock = createAsyncStorageMock();
  storageMock.values.set('identity', 'saved');
  const storage = await hydrateStorage(storageMock, ['identity'], vi.fn());
  expect(storage.getItem('identity')).toBe('saved');
  expect(storage.getItem('missing')).toBeNull();
});

it('orders writes and deletes without resurrecting an older value', async () => {
  const storageMock = createAsyncStorageMock();
  const firstWrite = deferred<void>();
  storageMock.setItem.mockImplementationOnce(async (key, value) => {
    await firstWrite.promise;
    storageMock.values.set(key, value);
  });
  const storage = await hydrateStorage(storageMock, [], vi.fn());
  storage.setItem('identity', 'old');
  await Promise.resolve();
  storage.setItem('identity', 'new');
  storage.removeItem('identity');
  const flush = storage.flush();
  expect(storageMock.removeItem).not.toHaveBeenCalled();
  expect(storage.getItem('identity')).toBeNull();
  firstWrite.resolve();
  await flush;
  expect(storageMock.values.has('identity')).toBe(false);
});

it('reports a failed write and retries the latest pending value on flush', async () => {
  const storageMock = createAsyncStorageMock();
  const onError = vi.fn();
  const error = new Error('Disk full');
  storageMock.setItem.mockRejectedValueOnce(error);
  const storage = await hydrateStorage(storageMock, [], onError);
  storage.setItem('identity', 'saved');
  await expect(storage.flush()).rejects.toThrow('Disk full');
  expect(onError).toHaveBeenCalledWith(error);
  await storage.flush();
  expect(storageMock.values.get('identity')).toBe('saved');
});

it('does not retry a failed stale snapshot over a newer deletion', async () => {
  const storageMock = createAsyncStorageMock();
  const write = deferred<void>();
  storageMock.setItem.mockImplementationOnce(() => write.promise);
  const storage = await hydrateStorage(storageMock, [], vi.fn());
  storage.setItem('events', 'old');
  await Promise.resolve();
  storage.removeItem('events');
  const flush = storage.flush();
  write.reject(new Error('Write failed'));
  await expect(flush).rejects.toThrow('Write failed');
  await storage.flush();
  expect(storageMock.removeItem).toHaveBeenCalledWith('events');
  expect(storageMock.setItem).toHaveBeenCalledTimes(1);
});

it('fails hydration without creating a replacement identity', async () => {
  const storageMock = createAsyncStorageMock();
  storageMock.getItem.mockRejectedValue(new Error('Read failed'));
  await expect(
    hydrateStorage(storageMock, ['identity'], vi.fn())
  ).rejects.toThrow('Read failed');
  expect(storageMock.setItem).not.toHaveBeenCalled();
});

it('ignores late writes from disposed clients', async () => {
  const storageMock = createAsyncStorageMock();
  const storage = await hydrateStorage(storageMock, [], vi.fn());
  storage.setItem('events', 'in-flight');
  await storage.close();
  storage.removeItem('events');
  await storage.flush();
  expect(storageMock.values.get('events')).toBe('in-flight');
});
