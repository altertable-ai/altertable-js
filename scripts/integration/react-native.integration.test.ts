import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';

import {
  createAltertable,
  type ReactNativeClient,
  type ReactNativeConfig,
} from '../../packages/altertable-react-native/dist/index.mjs';
import { emitAppState } from '../../packages/altertable-react-native/test/reactNativeMock';
import {
  createFetchInterceptor,
  trackEventsOnPath,
} from './integration-helpers';

const endpoint = process.env.ALTERTABLE_ENDPOINT ?? 'http://127.0.0.1:15001';
const apiKey = process.env.ALTERTABLE_API_KEY ?? 'valid_api_key';
const environment = process.env.ALTERTABLE_ENVIRONMENT ?? 'integration_env';
const interceptor = createFetchInterceptor();
const clients: ReactNativeClient[] = [];
const nativeFetch = globalThis.fetch.bind(globalThis);
let unavailable = false;
let proxyEndpoint: string;

// Return real HTTP failures before forwarding recovery requests to altertable-mock.
const proxy = createServer(async (request, response) => {
  if (unavailable) {
    request.resume();
    response.writeHead(503).end();
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await nativeFetch(new URL(request.url!, endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': String(request.headers['x-api-key'] ?? ''),
      },
      body: Buffer.concat(chunks),
    });
    response.writeHead(result.status).end(await result.text());
  } catch {
    response.writeHead(502).end();
  }
});

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
}

async function create(options: Partial<ReactNativeConfig> = {}) {
  const client = await createAltertable(apiKey, {
    baseUrl: endpoint,
    environment,
    storage: createStorage(),
    flushEventThreshold: 100,
    flushIntervalMs: 1_000_000,
    ...options,
  });
  clients.push(client);

  return client;
}

function offlineConnectivity() {
  return {
    addEventListener(
      listener: (state: {
        isConnected: boolean;
        isInternetReachable: boolean;
      }) => void
    ) {
      listener({ isConnected: false, isInternetReachable: false });
      return () => {};
    },
  };
}

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', resolve);
  });
  proxyEndpoint = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  interceptor.install();
});

beforeEach(async () => {
  unavailable = false;
  await interceptor.reset();
});

afterEach(async () => {
  for (const client of clients.splice(0)) await client.dispose();
});

afterAll(async () => {
  interceptor.restore();
  await new Promise<void>((resolve, reject) =>
    proxy.close(error => (error ? reject(error) : resolve()))
  );
});

it('sends native events and identity operations through the built packages', async () => {
  const client = await create();
  client.identify('native-integration-user', { plan: 'pro' });
  client.updateTraits({ team: 'mobile' });
  client.track('Native Purchase', { amount: 42 });
  client.screen('Checkout');
  client.alias('native-linked-user');
  await client.flush();
  await interceptor.waitForPending();

  const captures = interceptor.getCaptures();
  expect(captures.every(call => call.status === 200)).toBe(true);
  expect(new Set(captures.map(call => call.path))).toEqual(
    new Set(['/track', '/identify', '/alias'])
  );
  expect(trackEventsOnPath(captures, '/track')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'Native Purchase',
        properties: expect.objectContaining({
          $lib: '@altertable/altertable-react-native',
          $os: 'ios',
          amount: 42,
        }),
      }),
      expect.objectContaining({
        event: '$screen',
        properties: expect.objectContaining({ $view_name: 'Checkout' }),
      }),
    ])
  );
});

it('restores offline events and their identity after a client restart', async () => {
  const storage = createStorage();
  const first = await create({ storage, connectivity: offlineConnectivity() });
  first.identify('native-restart-user');
  first.track('Before Restart');
  await first.dispose();
  const second = await create({ storage });
  await second.flush();
  const events = trackEventsOnPath(interceptor.getCaptures(), '/track');
  expect(events).toEqual([
    expect.objectContaining({
      event: 'Before Restart',
      distinct_id: 'native-restart-user',
    }),
  ]);
  expect(interceptor.getCaptures().every(call => call.status === 200)).toBe(
    true
  );
});

it('does not deliver the previous account backlog after switching accounts offline', async () => {
  const storage = createStorage();
  const first = await create({ storage, connectivity: offlineConnectivity() });
  first.identify('native-account-a');
  first.track('Account A');
  first.identify('native-account-b');
  first.track('Account B');
  await first.dispose();
  const second = await create({ storage });
  await second.flush();
  expect(trackEventsOnPath(interceptor.getCaptures(), '/track')).toEqual([
    expect.objectContaining({
      event: 'Account B',
      distinct_id: 'native-account-b',
    }),
  ]);
});

it('persists consent denial across restart and only sends events after a new grant', async () => {
  const storage = createStorage();
  const first = await create({ storage, connectivity: offlineConnectivity() });
  first.track('Before Denial');
  await first.configure({ trackingConsent: 'denied' });
  await first.dispose();
  const second = await create({ storage });
  expect(second.getTrackingConsent()).toBe('denied');
  second.track('Denied');
  await second.flush();
  expect(interceptor.getCaptures()).toHaveLength(0);
  await second.configure({ trackingConsent: 'granted' });
  second.track('After Grant');
  await second.flush();
  expect(trackEventsOnPath(interceptor.getCaptures(), '/track')).toEqual([
    expect.objectContaining({ event: 'After Grant' }),
  ]);
});

it('bounds automatic retries on HTTP failure and delivers on resume after recovery', async () => {
  unavailable = true;
  const onError = vi.fn();
  const client = await create({
    baseUrl: proxyEndpoint,
    flushEventThreshold: 1,
    onError,
  });
  client.track('Retry After Outage');
  await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce(), {
    timeout: 15_000,
  });
  expect(interceptor.getCaptures()).toHaveLength(4);
  expect(interceptor.getCaptures().every(call => call.status === 503)).toBe(
    true
  );
  unavailable = false;
  emitAppState('active');
  await vi.waitFor(() =>
    expect(interceptor.getCaptures().at(-1)?.status).toBe(200)
  );
  expect(interceptor.getCaptures()).toHaveLength(5);
  expect(
    trackEventsOnPath(interceptor.getCaptures(), '/track').at(-1)?.event
  ).toBe('Retry After Outage');
});
