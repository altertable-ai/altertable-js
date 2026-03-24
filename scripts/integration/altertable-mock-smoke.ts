import { onAlias, onIdentify, onTrack } from '../../packages/altertable-segment/src/index';

const endpoint = process.env.ALTERTABLE_ENDPOINT ?? 'http://127.0.0.1:15001';

const settings = {
  apiKey: process.env.ALTERTABLE_API_KEY ?? 'valid_api_key',
  environment: process.env.ALTERTABLE_ENVIRONMENT ?? 'integration_env',
  endpoint,
};

const now = new Date().toISOString();

await onTrack(
  {
    type: 'track',
    event: 'ci_smoke_track',
    userId: 'ci-user-1',
    anonymousId: 'ci-anon-1',
    timestamp: now,
    properties: {
      source: 'github-actions',
      suite: 'integration',
    },
    context: {
      library: {
        name: 'altertable-segment',
        version: 'ci',
      },
      page: {
        url: 'https://example.com',
      },
      userAgent: 'ci-agent',
      ip: '127.0.0.1',
    },
    channel: 'server',
  },
  settings
);

await onIdentify(
  {
    type: 'identify',
    userId: 'ci-user-1',
    anonymousId: 'ci-anon-1',
    timestamp: now,
    traits: {
      plan: 'pro',
      ci: true,
    },
    context: {
      library: {
        name: 'altertable-segment',
        version: 'ci',
      },
      userAgent: 'ci-agent',
    },
    channel: 'server',
  },
  settings
);

await onAlias(
  {
    type: 'alias',
    userId: 'ci-user-1',
    previousId: 'ci-anon-1',
    timestamp: now,
    context: {
      device: { id: 'device-ci-1' },
    },
    channel: 'server',
  },
  settings
);

console.log('altertable-mock smoke passed');
