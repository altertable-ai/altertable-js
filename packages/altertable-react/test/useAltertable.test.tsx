import { altertable } from '@altertable/altertable-js';
import { fireEvent, render, screen } from '@testing-library/react';
import React, { useEffect } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { AltertableProvider, useAltertable } from '../src';

type SignupFunnelMapping = {
  signup: [
    {
      name: 'SignupStart';
      properties: { source: string };
    },
    {
      name: 'SignupSubmit';
      properties: { email: string; signupMethod: string };
    },
    {
      name: 'SignupComplete';
      properties: { userId: string };
    },
  ];
};

function SignupPage() {
  const { useFunnel, track } = useAltertable<SignupFunnelMapping>();
  const { track: trackSignup } = useFunnel('signup');

  useEffect(() => {
    track('SignupStart', { source: 'test' });
  }, [track]);

  return (
    <div>
      <button
        data-testid="signup-button"
        onClick={() => {
          trackSignup('SignupComplete', { userId: 'test' });
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
    expect(altertable.track).toHaveBeenLastCalledWith('SignupStart', {
      $lib: 'TEST_LIB_NAME',
      $lib_version: 'TEST_LIB_VERSION',
      source: 'test',
    });

    const signupButton = screen.getByTestId('signup-button');
    fireEvent.click(signupButton);

    expect(altertable.track).toHaveBeenCalledTimes(2);
    expect(altertable.track).toHaveBeenLastCalledWith('SignupComplete', {
      $lib: 'TEST_LIB_NAME',
      $lib_version: 'TEST_LIB_VERSION',
      userId: 'test',
    });
  });
});
