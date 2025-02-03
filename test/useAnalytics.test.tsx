import { expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { useAnalytics } from '../src';
import React from 'react';

export type TestMapping = {
  signup: [
    { name: 'SignupStart'; properties: { source: string } },
    {
      name: 'SignupSubmit';
      properties: { email: string; signupMethod: string };
    },
    { name: 'SignupComplete'; properties: { userId: string } },
  ];
  purchase: [
    { name: 'SelectPlan'; properties: { userId: string; plan: string } },
    {
      name: 'PurchaseComplete';
      properties: { userId: string; plan: string; currency: string };
    },
  ];
};

const Signup = () => {
  const { useFunnel, track } = useAnalytics<TestMapping>();
  const { track: trackSignup } = useFunnel('signup');
  const { track: trackPurchase } = useFunnel('purchase');

  track('SignupStart', { source: 'test' });

  trackSignup('SignupComplete', { userId: 'test' });

  trackPurchase('SelectPlan', { userId: 'test', plan: 'test' });
  trackPurchase('PurchaseComplete', {
    userId: 'test',
    plan: 'test',
    currency: 'test',
  });

  return null;
};

test('compiles', () => {
  expect(useAnalytics).toBeDefined();
  render(<Signup />);
});
