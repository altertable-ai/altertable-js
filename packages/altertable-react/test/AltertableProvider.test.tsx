import { altertable } from '@altertable/altertable-js';
import { render, screen } from '@testing-library/react';
import React, { type ComponentProps } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  AltertableProvider,
  useAltertableContext,
} from '../src/AltertableProvider';

beforeEach(() => {
  altertable.init('TEST_API_KEY');

  vi.clearAllMocks();
  vi.spyOn(altertable, 'track').mockImplementation(() => {});
});

describe('<AltertableProvider>', () => {
  test('renders children', () => {
    function App() {
      return (
        <AltertableProvider client={altertable}>Content</AltertableProvider>
      );
    }

    render(<App />);

    expect(screen.getByText('Content')).toBeDefined();
  });

  test('provides API to children through context', () => {
    function App() {
      return (
        <AltertableProvider client={altertable}>
          <ConsumerComponent data-testid="provider-test" />
        </AltertableProvider>
      );
    }

    function ConsumerComponent(props: ComponentProps<'div'>) {
      const context = useAltertableContext();
      return (
        <div {...props}>{context ? 'Context available' : 'No context'}</div>
      );
    }

    render(<App />);

    expect(screen.getByTestId('provider-test').textContent).toBe(
      'Context available'
    );
  });
});
