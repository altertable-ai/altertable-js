import type { EventPayload } from '../types';

const MAX_QUEUE_SIZE = 1000;

export class EventQueue {
  private _queue: EventPayload[] = [];

  enqueue(event: EventPayload): void {
    if (this._queue.length >= MAX_QUEUE_SIZE) {
      // Remove oldest event to make room for new one
      this._queue.shift();
    }
    this._queue.push(event);
  }

  flush(): EventPayload[] {
    const events = [...this._queue];
    this._queue = [];
    return events;
  }

  clear(): void {
    this._queue = [];
  }

  getSize(): number {
    return this._queue.length;
  }

  isEmpty(): boolean {
    return this._queue.length === 0;
  }
}
