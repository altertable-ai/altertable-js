const sdkModule = await import('../../packages/altertable-js/dist/index.js');
const { altertable, TrackingConsent } = sdkModule;

const endpoint = process.env.ALTERTABLE_ENDPOINT ?? 'http://127.0.0.1:15001';
const apiKey = process.env.ALTERTABLE_API_KEY ?? 'valid_api_key';
const environment = process.env.ALTERTABLE_ENVIRONMENT ?? 'integration_env';

type Capture = {
  path: string;
  searchParams: URLSearchParams;
  payload: Record<string, unknown> | Array<Record<string, unknown>>;
  status?: number;
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

  const capture: Capture = {
    path: parsed.pathname,
    searchParams: parsed.searchParams,
    payload,
  };
  captures.push(capture);

  // altertable-mock currently authenticates Product Analytics via headers.
  // Bridge from SDK query-param apiKey -> X-API-Key for integration testing.
  const headers = new Headers(init?.headers);
  const requestApiKey = parsed.searchParams.get('apiKey');
  if (requestApiKey) {
    headers.set('X-API-Key', requestApiKey);
  }

  const requestPromise = originalFetch(input as RequestInfo, {
    ...init,
    headers,
  })
    .then(response => {
      capture.status = response.status;
      return response;
    })
    .catch(error => {
      capture.status = -1;
      throw error;
    });

  pendingRequests.push(requestPromise);
  return requestPromise;
}) as typeof fetch;

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForAllRequests() {
  let observed = -1;

  while (observed !== pendingRequests.length) {
    observed = pendingRequests.length;
    await Promise.allSettled([...pendingRequests]);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

const errors: Error[] = [];

altertable.init(apiKey, {
  baseUrl: endpoint,
  environment,
  autoCapture: false,
  persistence: 'memory',
  trackingConsent: TrackingConsent.GRANTED,
  flushAt: 3,
  maxBatchSize: 2,
  flushIntervalMs: 60_000,
  onError: error => {
    errors.push(error);
  },
});

altertable.track('ci_smoke_track', {
  suite: 'integration',
  source: 'github-actions',
});
altertable.page('https://example.com/pricing?plan=pro');
altertable.track('ci_smoke_track_followup', { suite: 'integration' });
altertable.identify('ci-user-1', { plan: 'pro', ci: true });
altertable.updateTraits({ team: 'sdk', role: 'maintainer' });
altertable.alias('ci-user-1-linked');

await waitForAllRequests();

assert(errors.length === 0, `Expected no SDK errors, got ${errors.length}`);

const tracks = captures.filter(entry => entry.path === '/track');
const identifies = captures.filter(entry => entry.path === '/identify');
const aliases = captures.filter(entry => entry.path === '/alias');

assert(tracks.length > 0, 'Expected at least one /track call');
assert(identifies.length > 0, 'Expected at least one /identify call');
assert(aliases.length === 1, `Expected 1 /alias call, got ${aliases.length}`);

const normalize = (
  payload: Record<string, unknown> | Array<Record<string, unknown>>
): Array<Record<string, unknown>> => (Array.isArray(payload) ? payload : [payload]);

const allEvents = captures.flatMap(entry => normalize(entry.payload));

for (const call of captures) {
  assert(
    call.searchParams.get('apiKey') !== null,
    `Request to ${call.path} missing apiKey query param`
  );

  for (const eventPayload of normalize(call.payload)) {
    assert(
      eventPayload.environment === environment ||
        eventPayload.environment === 'production',
      `Request to ${call.path} missing expected environment`
    );
  }

  assert(
    call.status === 200,
    `Request to ${call.path} returned ${call.status}, expected 200`
  );
}

assert(
  captures.some(entry => Array.isArray(entry.payload)),
  'Expected at least one batched array payload'
);

const customTrack = allEvents.find(
  event => event.event === 'ci_smoke_track'
) as Record<string, unknown> | undefined;
assert(Boolean(customTrack), 'Missing custom track event payload');
assert(
  (customTrack?.properties as Record<string, unknown> | undefined)?.suite ===
    'integration',
  'Custom track payload missing expected properties.suite=integration'
);

const pageTrack = allEvents.find(
  event => event.event === '$pageview'
) as Record<string, unknown> | undefined;
assert(Boolean(pageTrack), 'Missing page() -> $pageview event');
assert(
  (pageTrack?.properties as Record<string, unknown> | undefined)?.$url ===
    'https://example.com/pricing',
  'Page payload missing normalized $url'
);
assert(
  (pageTrack?.properties as Record<string, unknown> | undefined)?.plan === 'pro',
  'Page payload missing querystring property plan=pro'
);

const identifyCall = allEvents.find(
  event => (event.traits as Record<string, unknown> | undefined)?.plan === 'pro'
);
assert(Boolean(identifyCall), 'Missing identify payload with initial traits');

const updateTraitsCall = allEvents.find(
  event => (event.traits as Record<string, unknown> | undefined)?.team === 'sdk'
);
assert(Boolean(updateTraitsCall), 'Missing updateTraits payload');

const aliasPayload = normalize(aliases[0].payload)[0];
assert(
  aliasPayload.new_user_id === 'ci-user-1-linked',
  'Alias payload missing new_user_id'
);

// Default environment path: SDK should send "production" when environment is omitted.
altertable.init(apiKey, {
  baseUrl: endpoint,
  autoCapture: false,
  persistence: 'memory',
  trackingConsent: TrackingConsent.GRANTED,
});
altertable.track('ci_smoke_default_environment', { case: 'default-env' });

await waitForAllRequests();

const defaultEnvTrack = captures
  .flatMap(entry => normalize(entry.payload))
  .find(event => event.event === 'ci_smoke_default_environment');
assert(Boolean(defaultEnvTrack), 'Missing default environment track payload');
assert(
  defaultEnvTrack?.environment === 'production',
  `Expected default environment=production, got ${String(defaultEnvTrack?.environment)}`
);

// Invalid API key path: mock should reject unauthorized requests.
altertable.init('__invalid_api_key__', {
  baseUrl: endpoint,
  environment,
  autoCapture: false,
  persistence: 'memory',
  trackingConsent: TrackingConsent.GRANTED,
});
altertable.track('ci_smoke_invalid_api_key', { case: 'invalid-key' });

await waitForAllRequests();

const invalidKeyTrack = captures.find(entry =>
  normalize(entry.payload).some(event => event.event === 'ci_smoke_invalid_api_key')
);
assert(Boolean(invalidKeyTrack), 'Missing invalid api key track payload');
assert(
  invalidKeyTrack?.status === 401,
  `Expected invalid API key request to return 401, got ${invalidKeyTrack?.status}`
);

console.log('altertable-js integration smoke passed');
