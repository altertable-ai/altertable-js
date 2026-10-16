import type { StorageAdapter } from '@altertable/altertable-js';

/** Compatible with AsyncStorage and other asynchronous key-value stores. */
export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

/** Hydrate before core initialization; keep native writes ordered and retryable. */
export async function hydrateStorage(
  backend: AsyncStorage,
  keys: string[],
  onError: (error: Error) => void
): Promise<
  StorageAdapter & {
    hasPendingWrites(): boolean;
    flush(): Promise<void>;
    close(): Promise<void>;
  }
> {
  const entries = await Promise.all(
    keys.map(async key => [key, await backend.getItem(key)] as const)
  );
  const values = new Map(entries);
  const pending = new Map<string, string | null>();
  let writing: Promise<void> | undefined;
  let closed = false;

  function startWriting() {
    if (writing || pending.size === 0) {
      return;
    }

    let failed = false;
    writing = Promise.resolve()
      .then(async () => {
        while (pending.size > 0) {
          const [key, value] = pending.entries().next().value!;
          pending.delete(key);
          try {
            if (value === null) {
              await backend.removeItem(key);
            } else {
              await backend.setItem(key, value);
            }
          } catch (error) {
            // A newer value always takes priority over a failed older write.
            if (!pending.has(key)) {
              pending.set(key, value);
            }

            failed = true;
            throw error;
          }
        }
        return;
      })
      .finally(() => {
        writing = undefined;
        if (!failed) {
          startWriting();
        }
      });
    void writing.catch(error =>
      onError(error instanceof Error ? error : new Error(String(error)))
    );
  }

  function update(key: string, value: string | null) {
    // Requests already in flight may finish after disposal. Preserve their
    // durable snapshot rather than letting an old client overwrite a new one.
    if (closed) {
      return;
    }

    values.set(key, value);
    pending.set(key, value);
    startWriting();
  }

  async function flush() {
    startWriting();
    while (writing) {
      await writing;
    }
  }

  return {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      update(key, value);

      return true;
    },
    removeItem(key) {
      update(key, null);
    },
    hasPendingWrites: () => pending.size > 0 || writing !== undefined,
    flush,
    close() {
      closed = true;

      return flush();
    },
  };
}
