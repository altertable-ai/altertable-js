// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import { type ReactNativeClient } from '../src/client';
import { AltertableProvider, useAltertable } from '../src/react';

it('shares a ready client without initializing it again', () => {
  const client = {} as ReactNativeClient;
  function wrapper({ children }: { children: ReactNode }) {
    return <AltertableProvider client={client}>{children}</AltertableProvider>;
  }
  const { result, unmount } = renderHook(useAltertable, { wrapper });
  expect(result.current).toBe(client);
  unmount();
});

it('requires a provider instead of silently using an uninitialized singleton', () => {
  expect(() => renderHook(useAltertable)).toThrow(
    '[Altertable] useAltertable() must be used within <AltertableProvider>.'
  );
});
