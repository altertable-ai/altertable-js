import { altertable } from '@altertable/altertable-js';
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
