import { type Altertable, altertable } from '@altertable/altertable-js';
import { fireEvent, render, screen } from '@testing-library/react';
import React, { useEffect } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { AltertableProvider, type FunnelMapping, useAltertable } from '../src';

interface SignupFunnelMapping extends FunnelMapping {
  signup: [
    {
      name: 'Signup Started';
      properties: { source: string };
    },
    {
      name: 'Signup Submitted';
      properties: { email: string; signupMethod: string };
    },
    {
      name: 'Signup Completed';
      properties: { userId: string };
    },
  ];
}

function SignupPage() {
  const { selectFunnel, track } = useAltertable<SignupFunnelMapping>();
  const { trackStep } = selectFunnel('signup');

  useEffect(() => {
    track('Signup Started', { source: 'test' });
  }, [track]);

  return (
    <div>
      <button
        data-testid="signup-button"
        onClick={() => {
          trackStep('Signup Completed', { userId: 'test' });
        }}
      >
        Signup
      </button>
    </div>
  );
}

describe('useAltertable()', () => {
  beforeEach(() => {
    altertable.init('TEST_API_KEY');

    vi.clearAllMocks();
    vi.spyOn(altertable, 'track').mockImplementation(() => {});
  });

  describe('API', () => {
    type UseAltertableReturn = ReturnType<typeof useAltertable>;
    const REACT_ONLY_METHODS: Array<keyof UseAltertableReturn> = [
      'selectFunnel',
    ];
    const CORE_ONLY_METHODS: Array<keyof Altertable> = [
      'init', // Handled by <AltertableProvider>, not exposed via useAltertable()
    ];

    test('exposes all Altertable public methods', () => {
      let exposedApi: UseAltertableReturn | null = null;

      function TestComponent(): null {
        exposedApi = useAltertable();
        return null;
      }

      render(
        <AltertableProvider client={altertable}>
          <TestComponent />
        </AltertableProvider>
      );

      const coreMethods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(altertable)
      ).filter(
        (m): m is keyof Altertable =>
          m !== 'constructor' &&
          !m.startsWith('_') &&
          !CORE_ONLY_METHODS.includes(m as keyof Altertable)
      );

      for (const method of coreMethods) {
        expect(exposedApi).toHaveProperty(method);
        expect(exposedApi[method as keyof UseAltertableReturn]).toBeInstanceOf(
          Function
        );
      }

      const allowedMethods = new Set<string>([
        ...coreMethods,
        ...REACT_ONLY_METHODS,
      ]);
      for (const key of Object.keys(exposedApi)) {
        expect(allowedMethods.has(key)).toBe(true);
      }
    });
  });

  test('tracks events', () => {
    function App() {
      return (
        <AltertableProvider client={altertable}>
          <SignupPage />
        </AltertableProvider>
      );
    }

    render(<App />);

    expect(altertable.track).toHaveBeenCalledTimes(1);
    expect(altertable.track).toHaveBeenLastCalledWith('Signup Started', {
      $lib: 'TEST_LIB_NAME',
      $lib_version: 'TEST_LIB_VERSION',
      source: 'test',
    });

    const signupButton = screen.getByTestId('signup-button');
    fireEvent.click(signupButton);

    expect(altertable.track).toHaveBeenCalledTimes(2);
    expect(altertable.track).toHaveBeenLastCalledWith('Signup Completed', {
      $lib: 'TEST_LIB_NAME',
      $lib_version: 'TEST_LIB_VERSION',
      userId: 'test',
    });
  });
});
