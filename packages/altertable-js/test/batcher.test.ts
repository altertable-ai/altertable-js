import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBatcher } from '../src/lib/batcher';
import type { EventPayload, EventType } from '../src/types';

function createTrackPayload(timestamp: string): EventPayload {
  return {
    event: 'test',
    timestamp,
    properties: {},
    environment: 'test',
    device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
    anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
    session_id: 'session-0197d9df-4e77-72cb-bf0a-e35b3f1f5425',
  };
}

describe('createBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes when combined buffer size reaches flushAt', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 3,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    batcher.add('identify', {
      environment: 'test',
      device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
      anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      traits: {},
    });
    expect(send).not.toHaveBeenCalled();

    batcher.add('alias', {
      environment: 'test',
      device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
      anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c',
      new_user_id: 'u_new',
    });

    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('timer-based flush fires after flushIntervalMs', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 100,
      flushIntervalMs: 5_000,
      maxBatchSize: 50,
      send,
    });
    batcher.start();
    batcher.add('track', createTrackPayload('t1'));

    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(send).toHaveBeenCalledTimes(1);
    batcher.stop();
  });

  it('chunks payloads when more than flushAt of one type', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 2,
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      send,
    });

    batcher.add('track', createTrackPayload('a'));
    batcher.add('track', createTrackPayload('b'));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    batcher.add('track', createTrackPayload('c'));
    await batcher.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'a' }),
        expect.objectContaining({ timestamp: 'b' }),
      ])
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      'track',
      [expect.objectContaining({ timestamp: 'c' })]
    );
  });

  it('routes mixed types to separate send calls', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 2,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });

    const identifyPayload = {
      environment: 'test',
      device_id: 'device-0197d9df-3c3b-734e-96dd-dfda52b0167c' as const,
      distinct_id: 'u_01jzcxxwcgfzztabq1e3dk1y8q',
      anonymous_id: 'anonymous-0197d9df-3c3b-734e-96dd-dfda52b0167c' as const,
      traits: { x: 1 },
    };

    batcher.add('track', createTrackPayload('t1'));
    batcher.add('identify', identifyPayload as EventPayload);

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const types = send.mock.calls.map(call => call[0] as EventType);
    expect(types.sort()).toEqual(['identify', 'track']);
  });

  it('requeues chunk when send rejects', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(undefined);

    const batcher = createBatcher({
      flushAt: 1,
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    batcher.add('track', createTrackPayload('t2'));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));

    expect(send).toHaveBeenNthCalledWith(
      2,
      'track',
      expect.arrayContaining([expect.objectContaining({ timestamp: 't1' })])
    );
  });

  it('does not requeue chunk when clear() runs before a failed send settles', async () => {
    let rejectSend: (reason: unknown) => void;
    const send = vi.fn().mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject;
        })
    );

    const batcher = createBatcher({
      flushAt: 1,
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    expect(send).toHaveBeenCalledTimes(1);

    batcher.clear();
    rejectSend!(new Error('fail'));
    await Promise.resolve();
    await Promise.resolve();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flush() awaits in-flight dispatch started by flushAt before resolving', async () => {
    let resolveFirstSend: () => void;
    const send = vi.fn().mockImplementation(() => {
      if (send.mock.calls.length === 1) {
        return new Promise<void>(resolve => {
          resolveFirstSend = resolve;
        });
      }
      return Promise.resolve();
    });

    const batcher = createBatcher({
      flushAt: 1,
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    expect(send).toHaveBeenCalledTimes(1);

    let flushSettled = false;
    const flushPromise = batcher.flush().then(() => {
      flushSettled = true;
    });

    await Promise.resolve();
    expect(flushSettled).toBe(false);

    resolveFirstSend!();
    await flushPromise;
    expect(flushSettled).toBe(true);
  });

  it('flush() returns a promise that settles after sends complete', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 20,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });
    batcher.add('track', createTrackPayload('t1'));
    await batcher.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flush() does not await in-flight sends started by the interval timer', async () => {
    let resolveTimerSend: (() => void) | undefined;
    const send = vi.fn().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveTimerSend = resolve;
        })
    );

    const batcher = createBatcher({
      flushAt: 100,
      flushIntervalMs: 5_000,
      maxBatchSize: 50,
      send,
    });
    batcher.start();
    batcher.add('track', createTrackPayload('t1'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(send).toHaveBeenCalledTimes(1);

    const flushPromise = batcher.flush();
    await flushPromise;

    expect(resolveTimerSend).toBeDefined();
    resolveTimerSend!();
    await Promise.resolve();

    batcher.stop();
  });

  it('preserves timestamps when events wait in the buffer', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 10,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });
    batcher.start();

    batcher.add('track', createTrackPayload('2020-01-01T00:00:00.000Z'));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(send).toHaveBeenCalledWith(
      'track',
      expect.arrayContaining([
        expect.objectContaining({
          timestamp: '2020-01-01T00:00:00.000Z',
        }),
      ])
    );
    batcher.stop();
  });

  it('chunks by maxBatchSize when a flush holds more than maxBatchSize items', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 10,
      flushIntervalMs: 60_000,
      maxBatchSize: 3,
      send,
    });

    for (let index = 0; index < 7; index += 1) {
      batcher.add('track', createTrackPayload(`t${index}`));
    }
    await batcher.flush();

    const trackSends = send.mock.calls.filter(call => call[0] === 'track');
    expect(trackSends).toHaveLength(3);
    expect(trackSends[0][1]).toHaveLength(3);
    expect(trackSends[1][1]).toHaveLength(3);
    expect(trackSends[2][1]).toHaveLength(1);
  });

  it('flushAt triggers flush while chunk size follows maxBatchSize', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 4,
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      send,
    });

    batcher.add('track', createTrackPayload('a'));
    batcher.add('track', createTrackPayload('b'));
    batcher.add('track', createTrackPayload('c'));
    expect(send).not.toHaveBeenCalled();

    batcher.add('track', createTrackPayload('d'));
    await vi.waitFor(() => expect(send).toHaveBeenCalled());

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'a' }),
        expect.objectContaining({ timestamp: 'b' }),
      ])
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'c' }),
        expect.objectContaining({ timestamp: 'd' }),
      ])
    );
  });

  it('flushes when updateConfig lowers flushAt to at or below buffered count', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 100,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });

    batcher.add('track', createTrackPayload('a'));
    batcher.add('track', createTrackPayload('b'));
    batcher.add('track', createTrackPayload('c'));
    expect(send).not.toHaveBeenCalled();

    batcher.updateConfig({ flushAt: 3 });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(
      'track',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 'a' }),
        expect.objectContaining({ timestamp: 'b' }),
        expect.objectContaining({ timestamp: 'c' }),
      ])
    );
  });

  it('does not flush when updateConfig raises flushAt above buffered count', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 5,
      flushIntervalMs: 60_000,
      maxBatchSize: 50,
      send,
    });

    batcher.add('track', createTrackPayload('a'));
    batcher.add('track', createTrackPayload('b'));
    batcher.add('track', createTrackPayload('c'));
    expect(send).not.toHaveBeenCalled();

    batcher.updateConfig({ flushAt: 10 });
    expect(send).not.toHaveBeenCalled();
  });

  it('updateConfig replaces interval when flushIntervalMs changes while started', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = createBatcher({
      flushAt: 100,
      flushIntervalMs: 10_000,
      maxBatchSize: 50,
      send,
    });

    batcher.add('track', createTrackPayload('t1'));
    batcher.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockClear();
    batcher.add('track', createTrackPayload('t2'));
    batcher.updateConfig({ flushIntervalMs: 2_000 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'track',
      expect.arrayContaining([expect.objectContaining({ timestamp: 't2' })])
    );

    batcher.stop();
  });
});
