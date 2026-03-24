import { altertable, TrackingConsent } from '../../packages/altertable-js/src/index';

const endpoint = process.env.ALTERTABLE_ENDPOINT ?? 'http://127.0.0.1:15001';
const apiKey = process.env.ALTERTABLE_API_KEY ?? 'valid_api_key';
const environment = process.env.ALTERTABLE_ENVIRONMENT ?? 'integration_env';

const originalFetch = globalThis.fetch.bind(globalThis);
const pendingRequests: Promise<Response>[] = [];
const calledPaths: string[] = [];

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const { pathname } = new URL(url);
  calledPaths.push(pathname);

  const requestPromise = originalFetch(input as any, init).then(async response => {
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Request to ${pathname} failed (${response.status}): ${body}`);
    }
    return response;
  });

  pendingRequests.push(requestPromise);
  return requestPromise;
}) as typeof fetch;

altertable.init(apiKey, {
  baseUrl: endpoint,
  environment,
  autoCapture: false,
  persistence: 'memory',
  trackingConsent: TrackingConsent.GRANTED,
  onError: error => {
    throw error;
  },
});

altertable.track('ci_smoke_track', { suite: 'integration', source: 'github-actions' });
altertable.identify('ci-user-1', { plan: 'pro', ci: true });
altertable.alias('ci-user-1-linked');

await Promise.all(pendingRequests);

const expected = ['/track', '/identify', '/alias'];
const missing = expected.filter(path => !calledPaths.includes(path));
if (missing.length > 0) {
  throw new Error(
    `Missing expected endpoints: ${missing.join(', ')}. Called: ${calledPaths.join(', ')}`
  );
}

if (pendingRequests.length !== expected.length) {
  throw new Error(
    `Expected ${expected.length} requests, got ${pendingRequests.length}. Called: ${calledPaths.join(', ')}`
  );
}

console.log('altertable-js integration smoke passed');
