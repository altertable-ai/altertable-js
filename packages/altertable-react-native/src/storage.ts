import type { StorageAdapter } from '@altertable/altertable-js';

/** Compatible with AsyncStorage and other asynchronous key-value stores. */
export interface AsyncStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

interface HydratedStorage extends StorageAdapter {
  flush(): Promise<void>;
  close(): Promise<void>;
}

/** Hydrate before core initialization; keep native writes ordered and retryable. */
export async function hydrateStorage(
  backend: AsyncStorageAdapter,
  keys: string[],
  onError: (error: Error, operation: 'read' | 'write') => void,
  migrations: Array<[from: string, to: string]> = []
): Promise<HydratedStorage> {
  const entries = await Promise.all(
    keys.map(async key => [key, await backend.getItem(key)] as const)
  ).catch(error => {
    const sourceError =
      error instanceof Error ? error : new Error(String(error));
    onError(sourceError, 'read');
    throw sourceError;
  });
  const cachedValues = new Map(entries);
  // Migration must await durable writes. The write-behind adapter below only
  // acknowledges cache updates and cannot safely order a rename after a failure.
  try {
    for (const [from, to] of migrations) {
      const value = cachedValues.get(from);
      if (value == null) continue;
      if (cachedValues.get(to) == null) {
        await backend.setItem(to, value);
        cachedValues.set(to, value);
      }
      await backend.removeItem(from);
      cachedValues.set(from, null);
    }
  } catch (error) {
    const sourceError =
      error instanceof Error ? error : new Error(String(error));
    onError(sourceError, 'write');
    throw sourceError;
  }
  const pendingWrites = new Map<string, string | null>();
  let writeTask: Promise<void> | undefined;
  let isClosed = false;

  function startWriting() {
    if (writeTask || pendingWrites.size === 0) {
      return;
    }

    let writeFailed = false;
    writeTask = Promise.resolve()
      .then(async () => {
        while (pendingWrites.size > 0) {
          const [key, value] = pendingWrites.entries().next().value!;
          pendingWrites.delete(key);
          try {
            if (value === null) {
              await backend.removeItem(key);
            } else {
              await backend.setItem(key, value);
            }
          } catch (error) {
            // A newer value always takes priority over a failed older write.
            if (!pendingWrites.has(key)) {
              pendingWrites.set(key, value);
            }

            writeFailed = true;
            throw error;
          }
        }
        return;
      })
      .finally(() => {
        writeTask = undefined;
        if (!writeFailed) {
          startWriting();
        }
      });
    void writeTask.catch(error =>
      onError(
        error instanceof Error ? error : new Error(String(error)),
        'write'
      )
    );
  }

  function update(key: string, value: string | null) {
    // Requests already in flight may finish after disposal. Preserve their
    // durable snapshot rather than letting an old client overwrite a new one.
    if (isClosed) {
      return;
    }

    cachedValues.set(key, value);
    pendingWrites.set(key, value);
    startWriting();
  }

  async function flush() {
    startWriting();
    while (writeTask) {
      await writeTask;
    }
  }

  return {
    getItem: key => cachedValues.get(key) ?? null,
    setItem(key, value) {
      update(key, value);

      return true;
    },
    removeItem(key) {
      update(key, null);
    },
    flush,
    close() {
      isClosed = true;

      return flush();
    },
  };
}
