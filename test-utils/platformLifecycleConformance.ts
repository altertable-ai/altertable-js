import { expect, it, vi } from 'vitest';

interface LifecycleConformanceFixture {
  retire(): void | Promise<void>;
  replace():
    | { track(event: string): void; flush(): Promise<void> }
    | Promise<{ track(event: string): void; flush(): Promise<void> }>;
  setCleanupError(error?: Error): void;
  emitStale(): void;
  cleanup?(): void;
}

/** Shared by core runtimes and the public React Native factory. */
export function lifecycleOwnershipConformanceTests(
  createFixture: () => Promise<LifecycleConformanceFixture>
) {
  it.each([false, true])(
    'ignores late lifecycle callbacks from a retired subscription (cleanup fails=%s)',
    async fails => {
      const fixture = await createFixture();
      try {
        await vi.advanceTimersByTimeAsync(0);
        fixture.setCleanupError(
          fails ? new Error('Removal failed before detaching') : undefined
        );
        await fixture.retire();
        const client = await fixture.replace();
        await vi.advanceTimersByTimeAsync(0);
        client.track('New Owner');
        fixture.emitStale();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetch).not.toHaveBeenCalled();
        await client.flush();
        const events = vi
          .mocked(fetch)
          .mock.calls.flatMap(([, options]) =>
            JSON.parse(options!.body as string)
          );
        expect(events.map(event => event.event)).toEqual(['New Owner']);
      } finally {
        fixture.cleanup?.();
      }
    }
  );
}
