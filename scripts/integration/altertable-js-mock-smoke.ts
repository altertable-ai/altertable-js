const sdkModule = await import('../../packages/altertable-js/dist/index.js');
const { Altertable, TrackingConsent } = sdkModule;

const endpoint = process.env.ALTERTABLE_ENDPOINT ?? 'http://127.0.0.1:15001';
const apiKey = process.env.ALTERTABLE_API_KEY ?? 'valid_api_key';
const environment = process.env.ALTERTABLE_ENVIRONMENT ?? 'integration_env';

type Capture = {
  path: string;
  searchParams: URLSearchParams;
  payload: Record<string, unknown>;
};

const originalFetch = globalThis.fetch.bind(globalThis);
const pendingRequests: Promise<Response>[] = [];
const captures: Capture[] = [];

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const parsed = new URL(rawUrl);
  const bodyText = typeof init?.body === 'string' ? init.body : '{}';
  const payload = JSON.parse(bodyText) as Record<string, unknown>;

  captures.push({
    path: parsed.pathname,
    searchParams: parsed.searchParams,
    payload,
  });

  const requestPromise = originalFetch(input as RequestInfo, init);
  pendingRequests.push(requestPromise);
  return requestPromise;
}) as typeof fetch;

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const sdk = new Altertable();
const errors: Error[] = [];

sdk.init(apiKey, {
  baseUrl: endpoint,
  environment,
  autoCapture: false,
  persistence: 'memory',
  trackingConsent: TrackingConsent.GRANTED,
  onError: error => {
    errors.push(error);
  },
});

sdk.track('ci_smoke_track', { suite: 'integration', source: 'github-actions' });
sdk.page('https://example.com/pricing?plan=pro');
sdk.identify('ci-user-1', { plan: 'pro', ci: true });
sdk.updateTraits({ team: 'sdk', role: 'maintainer' });
sdk.alias('ci-user-1-linked');

await Promise.all(pendingRequests);

assert(errors.length === 0, `Expected no SDK errors, got ${errors.length}`);

const tracks = captures.filter(entry => entry.path === '/track');
const identifies = captures.filter(entry => entry.path === '/identify');
const aliases = captures.filter(entry => entry.path === '/alias');

assert(
  tracks.length === 2,
  `Expected 2 /track calls (track + page), got ${tracks.length}`
);
assert(
  identifies.length === 2,
  `Expected 2 /identify calls (identify + updateTraits), got ${identifies.length}`
);
assert(aliases.length === 1, `Expected 1 /alias call, got ${aliases.length}`);

for (const call of captures) {
  assert(
    call.searchParams.get('apiKey') === apiKey,
    `Request to ${call.path} missing expected apiKey query param`
  );
  assert(
    call.payload.environment === environment,
    `Request to ${call.path} missing expected environment=${environment}`
  );
}

const customTrack = tracks.find(entry => entry.payload.event === 'ci_smoke_track');
assert(Boolean(customTrack), 'Missing custom track event payload');
assert(
  customTrack?.payload.properties &&
    (customTrack.payload.properties as Record<string, unknown>).suite ===
      'integration',
  'Custom track payload missing expected properties.suite=integration'
);

const pageTrack = tracks.find(entry => entry.payload.event === '$pageview');
assert(Boolean(pageTrack), 'Missing page() -> $pageview event');
assert(
  pageTrack?.payload.properties &&
    (pageTrack.payload.properties as Record<string, unknown>).$url ===
      'https://example.com/pricing',
  'Page payload missing normalized $url'
);
assert(
  pageTrack?.payload.properties &&
    (pageTrack.payload.properties as Record<string, unknown>).plan === 'pro',
  'Page payload missing querystring property plan=pro'
);

const identifyCall = identifies.find(
  entry => (entry.payload.traits as Record<string, unknown> | undefined)?.plan === 'pro'
);
assert(Boolean(identifyCall), 'Missing identify payload with initial traits');

const updateTraitsCall = identifies.find(
  entry =>
    (entry.payload.traits as Record<string, unknown> | undefined)?.team === 'sdk'
);
assert(Boolean(updateTraitsCall), 'Missing updateTraits payload');

const aliasCall = aliases[0];
assert(
  aliasCall.payload.new_user_id === 'ci-user-1-linked',
  'Alias payload missing new_user_id'
);

// Negative path: unknown environment should map to environment-not-found.
const negative = new Altertable();
let environmentErrorCode: string | undefined;

negative.init(apiKey, {
  baseUrl: endpoint,
  environment: '__missing_environment__',
  autoCapture: false,
  persistence: 'memory',
  trackingConsent: TrackingConsent.GRANTED,
  onError: error => {
    environmentErrorCode = (error as any).errorCode;
  },
});

negative.track('ci_smoke_invalid_environment', { case: 'negative' });
await Promise.all(pendingRequests);

assert(
  environmentErrorCode === 'environment-not-found',
  `Expected environment-not-found error code, got ${environmentErrorCode ?? 'undefined'}`
);

console.log('altertable-js integration smoke passed');
