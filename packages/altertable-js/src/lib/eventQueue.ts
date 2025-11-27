import type { AltertableContext, EventType } from '../types';

type QueuedEvent<TPayload> = {
  eventType: EventType;
  payload: TPayload;
  sentAt: Date;
  context: AltertableContext;
};

export class EventQueue<TPayload> {
  private _queue: QueuedEvent<TPayload>[] = [];
  private _queueMaxSize: number;

  constructor(queueMaxSize: number) {
    this._queueMaxSize = queueMaxSize;
  }

  enqueue(
    eventType: 'track' | 'identify' | 'alias',
    payload: TPayload,
    context: AltertableContext
  ): void {
    if (this._queue.length >= this._queueMaxSize) {
      // Remove oldest event to make room for new one
      this._queue.shift();
    }
    this._queue.push({
      eventType,
      payload,
      context,
      sentAt: new Date(),
    });
  }

  flush(): Array<QueuedEvent<TPayload>> {
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
}
