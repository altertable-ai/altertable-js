import type {
  AliasPayload,
  EventPayload,
  IdentifyPayload,
  TrackPayload,
} from '../../packages/altertable-js/src/types';

export const ONE_DAY_MS = 86_400_000;
export const BURST_FLUSH_AT = 20;
export const BURST_FLUSH_INTERVAL_MS = 30_000;

export type CapturedRequest = {
  path: string;
  searchParams: URLSearchParams;
  payload: EventPayload[];
  status: number | undefined;
};

export function isTrackPayload(row: EventPayload): row is TrackPayload {
  return 'event' in row;
}

export function isIdentifyPayload(row: EventPayload): row is IdentifyPayload {
  return 'traits' in row && !('event' in row);
}

export function isAliasPayload(row: EventPayload): row is AliasPayload {
  return 'new_user_id' in row;
}

function parseEventPayloads(bodyText: string): EventPayload[] {
  const parsed: unknown = JSON.parse(bodyText);
  if (Array.isArray(parsed)) {
    return parsed as EventPayload[];
  }
  return [parsed as EventPayload];
}

export function eventsOnPath(
  captureList: CapturedRequest[],
  requestPath: string
): EventPayload[] {
  return captureList
    .filter(entry => entry.path === requestPath)
    .flatMap(entry => entry.payload);
}

export function trackEventsOnPath(
  captureList: CapturedRequest[],
  requestPath: string
): TrackPayload[] {
  return eventsOnPath(captureList, requestPath).filter(isTrackPayload);
}

export function identifyEventsOnPath(
  captureList: CapturedRequest[],
  requestPath: string
): IdentifyPayload[] {
  return eventsOnPath(captureList, requestPath).filter(isIdentifyPayload);
}

export function aliasEventsOnPath(
  captureList: CapturedRequest[],
  requestPath: string
): AliasPayload[] {
  return eventsOnPath(captureList, requestPath).filter(isAliasPayload);
}

export function createFetchInterceptor() {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const captures: CapturedRequest[] = [];
  const pendingRequests: Promise<Response>[] = [];

  async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const parsedUrl = new URL(rawUrl);
    const bodyText = typeof init?.body === 'string' ? init.body : '{}';
    const payload = parseEventPayloads(bodyText);

    const capture: CapturedRequest = {
      path: parsedUrl.pathname,
      searchParams: parsedUrl.searchParams,
      payload,
      status: undefined,
    };
    captures.push(capture);

    // altertable-mock authenticates Product Analytics via headers.
    // Bridge from SDK query-param apiKey -> X-API-Key for integration testing.
    const headers = new Headers(init?.headers);
    const requestApiKey = parsedUrl.searchParams.get('apiKey');
    if (requestApiKey) {
      headers.set('X-API-Key', requestApiKey);
    }

    const requestPromise = originalFetch(input as RequestInfo, {
      ...init,
      headers,
    }).then(response => {
      capture.status = response.status;
      return response;
    });

    pendingRequests.push(requestPromise);
    return requestPromise;
  }

  return {
    install(): void {
      globalThis.fetch = patchedFetch as typeof fetch;
    },
    restore(): void {
      globalThis.fetch = originalFetch;
    },
    async waitForPending(): Promise<void> {
      await Promise.all(pendingRequests);
    },
    async reset(): Promise<void> {
      await Promise.all(pendingRequests);
      captures.length = 0;
      pendingRequests.length = 0;
    },
    getCaptures(): CapturedRequest[] {
      return captures;
    },
  };
}
