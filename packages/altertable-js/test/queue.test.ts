import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Queue } from '../src/lib/queue';

type TestCommand = { type: string; value: number };

describe('Queue', () => {
  let queue: Queue<TestCommand>;

  beforeEach(() => {
    queue = new Queue<TestCommand>({ capacity: 3 });
  });

  describe('enqueue', () => {
    it('adds items to the queue', () => {
      queue.enqueue({ type: 'a', value: 1 });

      expect(queue.getSize()).toBe(1);
    });

    it('adds multiple items in order', () => {
      queue.enqueue({ type: 'a', value: 1 });
      queue.enqueue({ type: 'b', value: 2 });

      const items = queue.flush();

      expect(items).toEqual([
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
      ]);
    });

    it('drops oldest item when at max size', () => {
      queue.enqueue({ type: 'a', value: 1 });
      queue.enqueue({ type: 'b', value: 2 });
      queue.enqueue({ type: 'c', value: 3 });
      queue.enqueue({ type: 'd', value: 4 });

      expect(queue.getSize()).toBe(3);

      const items = queue.flush();

      expect(items).toEqual([
        { type: 'b', value: 2 },
        { type: 'c', value: 3 },
        { type: 'd', value: 4 },
      ]);
    });

    it('calls onDropOldest callback with dropped item when queue is full', () => {
      const onDropOldest = vi.fn();
      const queueWithCallback = new Queue<TestCommand>({
        capacity: 2,
        onDropOldest,
      });

      queueWithCallback.enqueue({ type: 'a', value: 1 });
      queueWithCallback.enqueue({ type: 'b', value: 2 });
      queueWithCallback.enqueue({ type: 'c', value: 3 });

      expect(onDropOldest).toHaveBeenCalledTimes(1);
      expect(onDropOldest).toHaveBeenCalledWith({ type: 'a', value: 1 });
    });
  });

  describe('flush', () => {
    it('returns all items', () => {
      queue.enqueue({ type: 'a', value: 1 });
      queue.enqueue({ type: 'b', value: 2 });

      const items = queue.flush();

      expect(items).toEqual([
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
      ]);
    });

    it('clears the queue after flushing', () => {
      queue.enqueue({ type: 'a', value: 1 });

      queue.flush();

      expect(queue.getSize()).toBe(0);
    });

    it('returns empty array when queue is empty', () => {
      const items = queue.flush();

      expect(items).toEqual([]);
    });

    it('returns a copy of items', () => {
      queue.enqueue({ type: 'a', value: 1 });

      const items = queue.flush();
      items.push({ type: 'b', value: 2 });

      expect(queue.getSize()).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all items', () => {
      queue.enqueue({ type: 'a', value: 1 });
      queue.enqueue({ type: 'b', value: 2 });

      queue.clear();

      expect(queue.getSize()).toBe(0);
    });

    it('allows new items after clearing', () => {
      queue.enqueue({ type: 'a', value: 1 });
      queue.clear();
      queue.enqueue({ type: 'b', value: 2 });

      expect(queue.flush()).toEqual([{ type: 'b', value: 2 }]);
    });
  });

  describe('getSize', () => {
    it('returns 0 for empty queue', () => {
      expect(queue.getSize()).toBe(0);
    });

    it('returns correct count after enqueue', () => {
      queue.enqueue({ type: 'a', value: 1 });
      queue.enqueue({ type: 'b', value: 2 });

      expect(queue.getSize()).toBe(2);
    });

    it('returns 0 after flush', () => {
      queue.enqueue({ type: 'a', value: 1 });
      queue.flush();

      expect(queue.getSize()).toBe(0);
    });
  });
});
