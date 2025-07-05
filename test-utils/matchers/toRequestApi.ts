import { expect, Mock } from 'vitest';

import type { EventPayload } from '../../packages/altertable-js/src/types';

export type RequestOptions = Partial<{
  payload: EventPayload;
  apiKey: string;
  baseUrl: string;
  callCount: number;
  method: 'beacon' | 'fetch';
}>;

type ValidationResult = {
  pass: boolean;
  message: () => string;
};

function resetNetworkMocks() {
  const beaconMock = (global.navigator as any)?.sendBeacon as Mock;
  const fetchMock = global.fetch as unknown as Mock;
  if (typeof beaconMock?.mockClear === 'function') beaconMock.mockClear();
  if (typeof fetchMock?.mockClear === 'function') fetchMock.mockClear();
}

function checkRequest(
  path?: string,
  options?: RequestOptions
): ValidationResult {
  // Check if beacon was called
  const beaconMock = (global.navigator as any)?.sendBeacon as Mock;
  const fetchMock = global.fetch as unknown as Mock;

  const beaconCalls = beaconMock?.mock.calls.length || 0;
  const fetchCalls = fetchMock?.mock.calls.length || 0;
  const totalCalls = beaconCalls + fetchCalls;

  // If no path is provided, we expect NO network calls
  if (!path) {
    if (totalCalls > 0) {
      return {
        pass: false,
        message: () => `Expected no API calls but ${totalCalls} were made.`,
      };
    }
    return {
      pass: true,
      message: () => 'No API calls were made as expected.',
    };
  }

  // Check call count if specified
  if (options?.callCount !== undefined && totalCalls !== options.callCount) {
    return {
      pass: false,
      message: () =>
        `Expected ${options.callCount} API calls but ${totalCalls} were made.`,
    };
  }

  // If path is provided but no calls were made, that's a failure
  if (totalCalls === 0) {
    return {
      pass: false,
      message: () => `Expected an API call to '${path}' but none was made.`,
    };
  }

  // Check if the expected method was used
  if (options?.method) {
    if (options.method === 'beacon' && beaconCalls === 0) {
      return {
        pass: false,
        message: () => `Expected beacon to be used but fetch was used instead.`,
      };
    }
    if (options.method === 'fetch' && fetchCalls === 0) {
      return {
        pass: false,
        message: () => `Expected fetch to be used but beacon was used instead.`,
      };
    }
  }

  return validateNetworkCall(path, options, beaconMock, fetchMock);
}

function validateNetworkCall(
  path: string,
  options: RequestOptions,
  beaconMock: Mock,
  fetchMock: Mock
): ValidationResult {
  if (beaconMock?.mock.calls.length > 0) {
    return validateBeaconCall(path, options, beaconMock);
  }

  if (fetchMock?.mock.calls.length > 0) {
    return validateFetchCall(path, options, fetchMock);
  }

  return {
    pass: false,
    message: () => `Expected an API call but none was made.`,
  };
}

function validateBeaconCall(
  path: string,
  options: RequestOptions,
  beaconMock: Mock
): ValidationResult {
  const callArgs = beaconMock.mock.calls[0];
  const actualUrl = callArgs[0];
  const actualBlob = callArgs[1];

  // Validate URL
  const validationErrors = validateUrl(actualUrl, path, {
    expectedQueryParam: options?.apiKey
      ? { name: 'apiKey', value: options.apiKey }
      : undefined,
    expectedBaseUrl: options?.baseUrl,
  });

  // Check payload if provided
  if (options?.payload) {
    expect(actualBlob).toBeInstanceOf(Blob);

    try {
      const blobText =
        (actualBlob as any).content || (actualBlob as any)._content || '';
      if (blobText) {
        const actualPayload = JSON.parse(blobText);
        validationErrors.push(
          ...validatePayload(actualPayload, options.payload)
        );
      } else {
        expect(actualBlob.size).toBeGreaterThan(0);
        validationErrors.push(
          'Beacon payload validation requires blob content access'
        );
      }
    } catch (error) {
      validationErrors.push(
        `Failed to parse beacon payload: ${JSON.stringify(error, null, 2)}`
      );
    }
  }

  if (validationErrors.length > 0) {
    return {
      pass: false,
      message: () => validationErrors.join('; '),
    };
  }

  expect(actualBlob).toBeInstanceOf(Blob);
  return { pass: true, message: () => `API call made via beacon` };
}

function validateFetchCall(
  path: string,
  options: RequestOptions,
  fetchMock: Mock
): ValidationResult {
  const fetchCall = fetchMock.mock.calls[0];
  const actualUrl = fetchCall[0];
  const fetchOptions = fetchCall[1];

  // Validate URL
  const validationErrors = validateUrl(actualUrl, path, {
    expectedQueryParam: options?.apiKey
      ? { name: 'apiKey', value: options.apiKey }
      : undefined,
    expectedBaseUrl: options?.baseUrl,
  });

  // Validate fetch options
  expect(fetchOptions.method).toBe('POST');
  expect(fetchOptions.headers['Content-Type']).toBe('application/json');

  // Check payload if provided
  if (options?.payload) {
    try {
      const actualPayload = JSON.parse(fetchOptions.body);
      validationErrors.push(...validatePayload(actualPayload, options.payload));
    } catch (error) {
      validationErrors.push(
        `Failed to parse payload: ${JSON.stringify(error, null, 2)}`
      );
    }
  }

  if (validationErrors.length > 0) {
    return {
      pass: false,
      message: () => validationErrors.join('; '),
    };
  }

  return { pass: true, message: () => `API call made via fetch` };
}

function validateUrl(
  actualUrl: string,
  expectedPath?: string,
  options?: {
    expectedQueryParam?: { name: string; value: string };
    expectedBaseUrl?: string;
  }
): string[] {
  const validationErrors: string[] = [];

  // Check path if provided
  if (expectedPath && !actualUrl.includes(expectedPath)) {
    validationErrors.push(
      `Expected URL to contain path '${expectedPath}' but got '${actualUrl}'`
    );
  }

  // Check query parameter if provided
  if (options?.expectedQueryParam) {
    const { name, value } = options.expectedQueryParam;
    const expectedParam = `${name}=${encodeURIComponent(value)}`;
    if (!actualUrl.includes(expectedParam)) {
      validationErrors.push(
        `Expected URL to contain query parameter '${expectedParam}' but got '${actualUrl}'`
      );
    }
  }

  // Check base URL if provided
  if (options?.expectedBaseUrl) {
    if (!actualUrl.startsWith(options.expectedBaseUrl)) {
      validationErrors.push(
        `Expected URL to start with '${options.expectedBaseUrl}' but got '${actualUrl}'`
      );
    }
  }

  return validationErrors;
}

function validatePayload(
  actual: any,
  expected: any,
  path: string = ''
): string[] {
  const validationErrors: string[] = [];

  if (
    expected &&
    typeof expected === 'object' &&
    expected.sample !== undefined
  ) {
    // This is an expect matcher (like expect.stringMatching, expect.objectContaining)
    try {
      expect(actual).toEqual(expected);
    } catch (matcherError) {
      validationErrors.push(
        `Payload validation failed at ${path}: ${JSON.stringify(matcherError, null, 2)}`
      );
    }
  } else if (
    expected &&
    typeof expected === 'object' &&
    !Array.isArray(expected)
  ) {
    // Regular object - recursively validate each property
    for (const [key, value] of Object.entries(expected)) {
      const newPath = path ? `${path}.${key}` : key;
      validationErrors.push(...validatePayload(actual[key], value, newPath));
    }
  } else {
    // Regular value - direct comparison
    if (actual !== expected) {
      validationErrors.push(
        `Payload mismatch at ${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  return validationErrors;
}

export function toRequestApi(
  received: () => void,
  path?: string,
  options?: RequestOptions
) {
  // Reset network mocks before running the test
  resetNetworkMocks();
  // Execute the function to trigger the network call
  received();
  return checkRequest(path, options);
}
