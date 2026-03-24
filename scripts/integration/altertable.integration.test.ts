import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  altertable,
  TrackingConsent,
} from '../../packages/altertable-js/dist/index.js';
import {
  aliasEventsOnPath,
  BURST_FLUSH_AT,
  BURST_FLUSH_INTERVAL_MS,
  createFetchInterceptor,
  identifyEventsOnPath,
  isTrackPayload,
  ONE_DAY_MS,
  trackEventsOnPath,
} from './integration-helpers.js';

const endpoint = process.env.ALTERTABLE_ENDPOINT ?? 'http://127.0.0.1:15001';
const apiKey = process.env.ALTERTABLE_API_KEY ?? 'valid_api_key';
const environment = process.env.ALTERTABLE_ENVIRONMENT ?? 'integration_env';

const interceptor = createFetchInterceptor();

describe('altertable-js integration (altertable-mock)', () => {
  const sdkErrors: Error[] = [];

  beforeAll(() => {
    interceptor.install();
  });

  afterAll(() => {
    interceptor.restore();
  });

  beforeEach(async () => {
    await interceptor.reset();
    sdkErrors.length = 0;
  });

  it('sends track, page, identify, updateTraits, and alias with expected payloads', async () => {
    altertable.init(apiKey, {
      baseUrl: endpoint,
      environment,
      autoCapture: false,
      persistence: 'memory',
      trackingConsent: TrackingConsent.GRANTED,
      flushAt: BURST_FLUSH_AT,
      flushIntervalMs: BURST_FLUSH_INTERVAL_MS,
      onError: error => {
        sdkErrors.push(error);
      },
    });

    altertable.track('ci_smoke_track', {
      suite: 'integration',
      source: 'github-actions',
    });
    altertable.page('https://example.com/pricing?plan=pro');
    altertable.identify('ci-user-1', { plan: 'pro', ci: true });
    altertable.updateTraits({ team: 'sdk', role: 'maintainer' });
    altertable.alias('ci-user-1-linked');

    await altertable.flush();
    await interceptor.waitForPending();

    const captureList = interceptor.getCaptures();

    expect(sdkErrors).toHaveLength(0);

    const trackEvents = trackEventsOnPath(captureList, '/track');
    const identifyEvents = identifyEventsOnPath(captureList, '/identify');
    const aliasEvents = aliasEventsOnPath(captureList, '/alias');

    expect(trackEvents).toHaveLength(2);
    expect(identifyEvents).toHaveLength(2);
    expect(aliasEvents).toHaveLength(1);

    for (const call of captureList) {
      expect(
        call.searchParams.get('apiKey'),
        `Request to ${call.path} should include apiKey`
      ).not.toBeNull();
      for (const row of call.payload) {
        expect(
          row.environment,
          `Request to ${call.path} should set environment`
        ).toBe(environment);
      }
      expect(call.status, `Request to ${call.path} should return 200`).toBe(
        200
      );
    }

    const customTrack = trackEvents.find(row => row.event === 'ci_smoke_track');
    expect(customTrack).toBeDefined();
    expect(customTrack).toMatchObject({
      event: 'ci_smoke_track',
      properties: expect.objectContaining({
        suite: 'integration',
      }),
    });

    const pageTrack = trackEvents.find(row => row.event === '$pageview');
    expect(pageTrack).toBeDefined();
    expect(pageTrack).toMatchObject({
      event: '$pageview',
      properties: expect.objectContaining({
        $url: 'https://example.com/pricing',
        plan: 'pro',
      }),
    });

    const identifyCall = identifyEvents.find(row => row.traits.plan === 'pro');
    expect(identifyCall).toBeDefined();

    const updateTraitsCall = identifyEvents.find(
      row => row.traits.team === 'sdk'
    );
    expect(updateTraitsCall).toBeDefined();

    expect(aliasEvents[0]).toMatchObject({
      new_user_id: 'ci-user-1-linked',
    });
  });

  it('batches multiple track calls into one /track request when flushed together', async () => {
    altertable.init(apiKey, {
      baseUrl: endpoint,
      environment,
      autoCapture: false,
      persistence: 'memory',
      trackingConsent: TrackingConsent.GRANTED,
      flushAt: BURST_FLUSH_AT,
      flushIntervalMs: BURST_FLUSH_INTERVAL_MS,
      onError: error => {
        sdkErrors.push(error);
      },
    });

    altertable.track('ci_burst_a', { n: 1 });
    altertable.track('ci_burst_b', { n: 2 });
    altertable.identify('ci-burst-user', { burst: true });
    await altertable.flush();
    await interceptor.waitForPending();

    const captureList = interceptor.getCaptures();
    expect(sdkErrors).toHaveLength(0);

    const burstTrackBatch = captureList.find(call => {
      if (call.path !== '/track') {
        return false;
      }
      const events = call.payload.filter(isTrackPayload);
      return (
        events.some(row => row.event === 'ci_burst_a') &&
        events.some(row => row.event === 'ci_burst_b')
      );
    });

    expect(burstTrackBatch).toBeDefined();
    expect(
      burstTrackBatch!.payload.filter(isTrackPayload).length
    ).toBeGreaterThanOrEqual(2);
  });

  it('defaults environment to production when omitted from config', async () => {
    altertable.init(apiKey, {
      baseUrl: endpoint,
      autoCapture: false,
      persistence: 'memory',
      trackingConsent: TrackingConsent.GRANTED,
      flushAt: 1,
      flushIntervalMs: ONE_DAY_MS,
      onError: error => {
        sdkErrors.push(error);
      },
    });

    altertable.track('ci_smoke_default_environment', { case: 'default-env' });
    await altertable.flush();
    await interceptor.waitForPending();

    const captureList = interceptor.getCaptures();
    expect(sdkErrors).toHaveLength(0);

    const defaultEnvTrack = trackEventsOnPath(captureList, '/track').find(
      row => row.event === 'ci_smoke_default_environment'
    );
    expect(defaultEnvTrack).toBeDefined();
    expect(defaultEnvTrack!.environment).toBe('production');

    const defaultCapture = captureList.find(call =>
      call.payload.some(
        row =>
          isTrackPayload(row) && row.event === 'ci_smoke_default_environment'
      )
    );
    expect(defaultCapture?.status).toBe(200);
  });

  it('receives 401 from mock when API key is invalid', async () => {
    altertable.init('__invalid_api_key__', {
      baseUrl: endpoint,
      environment,
      autoCapture: false,
      persistence: 'memory',
      trackingConsent: TrackingConsent.GRANTED,
      flushAt: 1,
      flushIntervalMs: ONE_DAY_MS,
      onError: error => {
        sdkErrors.push(error);
      },
    });

    altertable.track('ci_smoke_invalid_api_key', { case: 'invalid-key' });
    await altertable.flush();
    await interceptor.waitForPending();

    const captureList = interceptor.getCaptures();

    const invalidKeyTrack = trackEventsOnPath(captureList, '/track').find(
      row => row.event === 'ci_smoke_invalid_api_key'
    );
    expect(invalidKeyTrack).toBeDefined();

    const invalidCapture = captureList.find(call =>
      call.payload.some(
        row => isTrackPayload(row) && row.event === 'ci_smoke_invalid_api_key'
      )
    );
    expect(invalidCapture?.status).toBe(401);
  });
});
