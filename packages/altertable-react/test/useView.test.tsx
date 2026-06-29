import { altertable } from '@altertable/altertable-js';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AltertableProvider, useScreenView, useView } from '../src';

type MockObserverRecord = {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn<() => void>>;
  observe: ReturnType<typeof vi.fn<(target: Element) => void>>;
  options?: IntersectionObserverInit;
};

function installIntersectionObserverMock() {
  const observers: MockObserverRecord[] = [];

  class MockIntersectionObserver implements IntersectionObserver {
    private readonly record: MockObserverRecord;
    readonly root: Element | Document | null;
    readonly rootMargin: string;
    readonly thresholds: ReadonlyArray<number>;

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit
    ) {
      this.root = options?.root ?? null;
      this.rootMargin = options?.rootMargin ?? '0px';
      this.thresholds = Array.isArray(options?.threshold)
        ? options.threshold
        : [options?.threshold ?? 0];

      this.record = {
        callback,
        disconnect: vi.fn<() => void>(),
        observe: vi.fn<(target: Element) => void>(),
        options,
      };
      observers.push(this.record);
    }

    disconnect(): void {
      this.record.disconnect();
    }

    observe(target: Element): void {
      this.record.observe(target);
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }

    unobserve = vi.fn();
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

  return observers;
}

function intersect(
  observer: MockObserverRecord,
  isIntersecting: boolean
): void {
  act(() => {
    observer.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  altertable.init('TEST_API_KEY', { autoCapture: false });

  vi.clearAllMocks();
  vi.spyOn(altertable, 'track').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useScreenView()', () => {
  test('tracks a screen view', () => {
    function DashboardScreen(): null {
      useScreenView('Dashboard', {
        id: 'dashboard-1',
        properties: { dashboardId: 'dashboard-1' },
      });
      return null;
    }

    render(
      <AltertableProvider client={altertable}>
        <DashboardScreen />
      </AltertableProvider>
    );

    expect(altertable.track).toHaveBeenCalledTimes(1);
    expect(altertable.track).toHaveBeenLastCalledWith('$screen', {
      $lib: 'TEST_LIB_NAME',
      $lib_version: 'TEST_LIB_VERSION',
      $view_id: 'dashboard-1',
      $view_name: 'Dashboard',
      $view_type: 'screen',
      dashboardId: 'dashboard-1',
    });
  });

  test('does not double-track during React Strict Mode effect replay', () => {
    function DashboardScreen(): null {
      useScreenView('Dashboard', { id: 'dashboard-1' });
      return null;
    }

    render(
      <React.StrictMode>
        <AltertableProvider client={altertable}>
          <DashboardScreen />
        </AltertableProvider>
      </React.StrictMode>
    );

    expect(altertable.track).toHaveBeenCalledTimes(1);
  });

  test('does not track when disabled', () => {
    function DashboardScreen(): null {
      useScreenView('Dashboard', { disabled: true });
      return null;
    }

    render(
      <AltertableProvider client={altertable}>
        <DashboardScreen />
      </AltertableProvider>
    );

    expect(altertable.track).not.toHaveBeenCalled();
  });

  test('omits the view id property when no screen id is provided', () => {
    function SignupScreen(): null {
      useScreenView('Signup');
      return null;
    }

    render(
      <AltertableProvider client={altertable}>
        <SignupScreen />
      </AltertableProvider>
    );

    expect(altertable.track).toHaveBeenCalledTimes(1);
    expect(altertable.track).toHaveBeenLastCalledWith('$screen', {
      $lib: 'TEST_LIB_NAME',
      $lib_version: 'TEST_LIB_VERSION',
      $view_name: 'Signup',
      $view_type: 'screen',
    });
  });

  test('tracks again when the screen identity changes', () => {
    function DashboardScreen({ dashboardId }: { dashboardId: string }): null {
      useScreenView('Dashboard', { id: dashboardId });
      return null;
    }

    const { rerender } = render(
      <AltertableProvider client={altertable}>
        <DashboardScreen dashboardId="dashboard-1" />
      </AltertableProvider>
    );

    rerender(
      <AltertableProvider client={altertable}>
        <DashboardScreen dashboardId="dashboard-2" />
      </AltertableProvider>
    );

    expect(altertable.track).toHaveBeenCalledTimes(2);
    expect(altertable.track).toHaveBeenLastCalledWith(
      '$screen',
      expect.objectContaining({ $view_id: 'dashboard-2' })
    );
  });

  test('sends once per screen identity with properties from the first eligible render', () => {
    function DashboardScreen({
      enabled,
      rank,
    }: {
      enabled: boolean;
      rank: number;
    }): null {
      useScreenView('Dashboard', {
        disabled: !enabled,
        id: 'dashboard-1',
        properties: { rank },
      });
      return null;
    }

    const { rerender } = render(
      <AltertableProvider client={altertable}>
        <DashboardScreen enabled={false} rank={1} />
      </AltertableProvider>
    );

    rerender(
      <AltertableProvider client={altertable}>
        <DashboardScreen enabled rank={2} />
      </AltertableProvider>
    );
    rerender(
      <AltertableProvider client={altertable}>
        <DashboardScreen enabled rank={3} />
      </AltertableProvider>
    );

    expect(altertable.track).toHaveBeenCalledTimes(1);
    expect(altertable.track).toHaveBeenLastCalledWith(
      '$screen',
      expect.objectContaining({ rank: 2 })
    );
  });
});

describe('useView()', () => {
  test('returns a viewRef and tracks when the element becomes visible', async () => {
    const observers = installIntersectionObserverMock();

    function InsightCard(): React.JSX.Element {
      const { viewRef } = useView<HTMLDivElement>('Insight', {
        id: 'insight-1',
        properties: { insightId: 'insight-1' },
      });

      return <div ref={viewRef}>Insight</div>;
    }

    render(
      <AltertableProvider client={altertable}>
        <InsightCard />
      </AltertableProvider>
    );

    await waitFor(() => {
      expect(observers[0].observe).toHaveBeenCalledTimes(1);
    });

    intersect(observers[0], true);

    expect(altertable.track).toHaveBeenCalledTimes(1);
    expect(altertable.track).toHaveBeenLastCalledWith('$view', {
      $lib: 'TEST_LIB_NAME',
      $lib_version: 'TEST_LIB_VERSION',
      $view_id: 'insight-1',
      $view_name: 'Insight',
      $view_type: 'view',
      insightId: 'insight-1',
    });
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
  });

  test('ignores repeated visibility notifications for the same view identity', async () => {
    const observers = installIntersectionObserverMock();

    function InsightCard(): React.JSX.Element {
      const { viewRef } = useView<HTMLDivElement>('Insight', {
        id: 'insight-1',
      });

      return <div ref={viewRef}>Insight</div>;
    }

    render(
      <AltertableProvider client={altertable}>
        <InsightCard />
      </AltertableProvider>
    );

    await waitFor(() => {
      expect(observers[0].observe).toHaveBeenCalledTimes(1);
    });

    intersect(observers[0], true);
    intersect(observers[0], true);

    expect(altertable.track).toHaveBeenCalledTimes(1);
  });

  test('does not track when the element is not visible', async () => {
    const observers = installIntersectionObserverMock();

    function InsightCard(): React.JSX.Element {
      const { viewRef } = useView<HTMLDivElement>('Insight');
      return <div ref={viewRef}>Insight</div>;
    }

    render(
      <AltertableProvider client={altertable}>
        <InsightCard />
      </AltertableProvider>
    );

    await waitFor(() => {
      expect(observers[0].observe).toHaveBeenCalledTimes(1);
    });

    intersect(observers[0], false);

    expect(altertable.track).not.toHaveBeenCalled();
    expect(observers[0].disconnect).not.toHaveBeenCalled();
  });

  test('forwards visibility options to IntersectionObserver', async () => {
    const observers = installIntersectionObserverMock();
    const root = document.createElement('main');

    function InsightCard(): React.JSX.Element {
      const { viewRef } = useView<HTMLDivElement>('Insight', {
        visibility: {
          root,
          rootMargin: '16px',
          threshold: 0.5,
        },
      });

      return <div ref={viewRef}>Insight</div>;
    }

    render(
      <AltertableProvider client={altertable}>
        <InsightCard />
      </AltertableProvider>
    );

    await waitFor(() => {
      expect(observers[0].observe).toHaveBeenCalledTimes(1);
    });

    expect(observers[0].options).toEqual({
      root,
      rootMargin: '16px',
      threshold: 0.5,
    });
  });

  test('disconnects the observer on unmount', async () => {
    const observers = installIntersectionObserverMock();

    function InsightCard(): React.JSX.Element {
      const { viewRef } = useView<HTMLDivElement>('Insight');
      return <div ref={viewRef}>Insight</div>;
    }

    const { unmount } = render(
      <AltertableProvider client={altertable}>
        <InsightCard />
      </AltertableProvider>
    );

    await waitFor(() => {
      expect(observers[0].observe).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
  });

  test('sends once per view identity and uses current properties when visible', async () => {
    const observers = installIntersectionObserverMock();

    function InsightCard({ rank }: { rank: number }): React.JSX.Element {
      const { viewRef } = useView<HTMLDivElement>('Insight', {
        id: 'insight-1',
        properties: { rank },
      });

      return <div ref={viewRef}>Insight</div>;
    }

    const { rerender } = render(
      <AltertableProvider client={altertable}>
        <InsightCard rank={1} />
      </AltertableProvider>
    );

    await waitFor(() => {
      expect(observers[0].observe).toHaveBeenCalledTimes(1);
    });

    rerender(
      <AltertableProvider client={altertable}>
        <InsightCard rank={2} />
      </AltertableProvider>
    );

    intersect(observers[0], true);
    intersect(observers[0], true);

    expect(altertable.track).toHaveBeenCalledTimes(1);
    expect(altertable.track).toHaveBeenLastCalledWith(
      '$view',
      expect.objectContaining({ rank: 2 })
    );
  });

  test('skips tracking and warns once when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    function InsightCard(): React.JSX.Element {
      const { viewRef } = useView<HTMLDivElement>('Insight', {
        id: 'insight-1',
      });

      return <div ref={viewRef}>Insight</div>;
    }

    render(
      <AltertableProvider client={altertable}>
        <InsightCard />
      </AltertableProvider>
    );

    expect(altertable.track).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenLastCalledWith(
      '[Altertable React] useView() requires IntersectionObserver. Skipping view tracking because this browser does not support it.'
    );

    render(
      <React.StrictMode>
        <AltertableProvider client={altertable}>
          <InsightCard />
        </AltertableProvider>
      </React.StrictMode>
    );

    expect(altertable.track).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('tracks again when the view identity changes', async () => {
    const observers = installIntersectionObserverMock();

    function InsightCard({
      insightId,
    }: {
      insightId: string;
    }): React.JSX.Element {
      const { viewRef } = useView<HTMLDivElement>('Insight', { id: insightId });
      return <div ref={viewRef}>Insight</div>;
    }

    const { rerender } = render(
      <AltertableProvider client={altertable}>
        <InsightCard insightId="insight-1" />
      </AltertableProvider>
    );

    await waitFor(() => {
      expect(observers[0].observe).toHaveBeenCalledTimes(1);
    });
    intersect(observers[0], true);

    rerender(
      <AltertableProvider client={altertable}>
        <InsightCard insightId="insight-2" />
      </AltertableProvider>
    );

    await waitFor(() => {
      expect(observers[1].observe).toHaveBeenCalledTimes(1);
    });
    intersect(observers[1], true);

    expect(altertable.track).toHaveBeenCalledTimes(2);
    expect(altertable.track).toHaveBeenLastCalledWith(
      '$view',
      expect.objectContaining({ $view_id: 'insight-2' })
    );
  });

  test('does not observe or track while disabled', () => {
    const observers = installIntersectionObserverMock();

    function InsightCard(): React.JSX.Element {
      const { viewRef } = useView<HTMLDivElement>('Insight', {
        disabled: true,
      });

      return <div ref={viewRef}>Insight</div>;
    }

    render(
      <AltertableProvider client={altertable}>
        <InsightCard />
      </AltertableProvider>
    );

    expect(observers).toHaveLength(0);
    expect(altertable.track).not.toHaveBeenCalled();
  });
});
