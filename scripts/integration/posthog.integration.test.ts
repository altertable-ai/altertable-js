// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it } from 'vitest';

import { altertable } from '../../packages/altertable-js/dist/index.js';
import { createFetchInterceptor, eventsOnPath } from './integration-helpers';

const interceptor = createFetchInterceptor();
beforeAll(() => interceptor.install());
afterAll(() => interceptor.restore());

it('accepts unprefixed source context and identity operations through the built SDK', async () => {
  let capture: (event: unknown) => void;
  const errors: Error[] = [];
  const cleanup = altertable.init(
    process.env.ALTERTABLE_API_KEY ?? 'valid_api_key',
    {
      baseUrl: process.env.ALTERTABLE_ENDPOINT ?? 'http://127.0.0.1:15001',
      environment: process.env.ALTERTABLE_ENVIRONMENT ?? 'integration_env',
      persistence: 'memory',
      eventPersistence: false,
      adapters: {
        posthog: {
          on: (_name, callback) => {
            capture = callback;
            return () => {};
          },
        },
      },
      onError: error => errors.push(error),
    }
  );
  try {
    const timestamp = new Date('2026-09-21T10:00:00.000Z');
    capture!({
      event: 'source-track',
      timestamp,
      properties: {
        distinct_id: 'external-anon',
        $device_id: 'external-device',
        $session_id: 'external-session',
      },
    });
    capture!({
      event: 'source-minimal',
      timestamp,
      properties: { distinct_id: 'external-anon' },
    });
    capture!({
      event: '$identify',
      timestamp,
      properties: {
        distinct_id: 'external-user',
        $anon_distinct_id: 'external-anon',
      },
      $set: { plan: 'pro' },
    });
    capture!({
      event: '$create_alias',
      timestamp,
      properties: { distinct_id: 'external-user', alias: 'external-alias' },
    });
    await altertable.flush();
    await interceptor.waitForPending();
    expect(errors).toEqual([]);
    const captures = interceptor.getCaptures();
    expect(captures.length).toBeGreaterThan(0);
    expect(captures.every(call => call.status === 200)).toBe(true);
    const tracks = eventsOnPath(captures, '/track');
    expect(tracks).toHaveLength(4);
    expect(tracks[0]).toMatchObject({
      distinct_id: 'external-anon',
      device_id: 'external-device',
      session_id: 'external-session',
    });
    expect(tracks[1]).not.toHaveProperty('device_id');
    expect(tracks[1]).not.toHaveProperty('session_id');
    for (const track of tracks) {
      expect(track).toMatchObject({
        timestamp: timestamp.toISOString(),
        properties: {
          $altertable_source: {
            provider: 'posthog',
            lib: '@altertable/altertable-js',
          },
        },
      });
    }
    for (const call of captures) {
      for (const record of call.payload) {
        expect(record).not.toHaveProperty('source');
        expect(record).not.toHaveProperty('provider');
      }
    }
    expect(eventsOnPath(captures, '/identify')).toMatchObject([
      {
        distinct_id: 'external-user',
        anonymous_id: 'external-anon',
        traits: { plan: 'pro' },
        timestamp: timestamp.toISOString(),
      },
    ]);
    expect(eventsOnPath(captures, '/alias')).toMatchObject([
      {
        distinct_id: 'external-user',
        new_user_id: 'external-alias',
        timestamp: timestamp.toISOString(),
      },
    ]);
  } finally {
    cleanup();
  }
});
