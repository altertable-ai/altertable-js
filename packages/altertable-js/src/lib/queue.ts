interface QueueOptions<TItem> {
  capacity: number;
  onDropOldest?: (command: TItem) => void;
}

export class Queue<TItem> {
  private _items: TItem[] = [];
  private _maxSize: number;
  private _onDropOldest?: (command: TItem) => void;

  constructor(options: QueueOptions<TItem>) {
    this._maxSize = options.capacity;
    this._onDropOldest = options.onDropOldest;
  }

  enqueue(command: TItem): void {
    if (this._items.length >= this._maxSize) {
      const dropped = this._items.shift();
      if (dropped) {
        this._onDropOldest?.(dropped);
      }
    }
    this._items.push(command);
  }

  flush(): TItem[] {
    const items = [...this._items];
    this._items = [];
    return items;
  }

  clear(): void {
    this._items = [];
  }

  getSize(): number {
    return this._items.length;
  }

  /** @internal */
  peek(): readonly TItem[] {
    return this._items;
  }
}
