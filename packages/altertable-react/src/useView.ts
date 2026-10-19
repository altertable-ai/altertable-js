import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAltertableContext } from './AltertableProvider';
import {
  EVENT_SCREEN,
  EVENT_VIEW,
  PROPERTY_LIB,
  PROPERTY_LIB_VERSION,
  PROPERTY_VIEW_ID,
  PROPERTY_VIEW_NAME,
  PROPERTY_VIEW_TYPE,
} from './constants';
import { logger } from './logger';

type ViewProperties = Record<string, unknown>;
type ViewType = 'screen' | 'view';

type BaseViewOptions = {
  /**
   * Stable identifier for this view instance within `name`.
   * Provide when multiple views share the same name. Typically the entity ID.
   */
  id?: string;
  /** Additional properties to include with the view event. */
  properties?: ViewProperties;
  /** Prevents the view event from being sent. */
  disabled?: boolean;
};

export type ScreenViewOptions = BaseViewOptions;

/**
 * Options forwarded to
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver/IntersectionObserver | `IntersectionObserver`}
 * for visibility-based view tracking.
 */
export type ViewVisibilityOptions = {
  /**
   * The element used as the viewport for checking visibility of the target.
   *
   * @default null
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver/IntersectionObserver#root | `IntersectionObserver`: `root`}
   */
  root?: Element | Document | null;
  /**
   * Offsets applied to the root's bounding box before intersection tests, using
   * the same syntax as the CSS `margin` property.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver/IntersectionObserver#rootmargin | `IntersectionObserver`: `rootMargin`}
   */
  rootMargin?: string;
  /**
   * One or more visibility ratios at which the observer callback runs. A value
   * of `0` fires when any pixel becomes visible; `1.0` fires when the target is
   * fully visible.
   *
   * @default 0
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver/IntersectionObserver#threshold | `IntersectionObserver`: `threshold`}
   */
  threshold?: number | number[];
};

export type ViewOptions = BaseViewOptions & {
  /**
   * Visibility settings for the underlying
   * {@link https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver | `IntersectionObserver`}.
   */
  visibility?: ViewVisibilityOptions;
};

type TrackedView = {
  id?: string;
  name: string;
  properties?: ViewProperties;
};

/**
 * Tracks a screen view when the component mounts.
 *
 * The hook prevents React Strict Mode effect replay from sending duplicate
 * view events in development.
 */
export function useScreenView(name: string, options: ScreenViewOptions = {}) {
  const altertable = useAltertableContext();
  const latestViewRef = useRef<TrackedView>({
    id: options.id,
    name,
    properties: options.properties,
  });
  const trackedKeysRef = useRef(new Set<string>());

  const { disabled = false, id, properties } = options;
  const viewKey = getViewKey(EVENT_SCREEN, name, id);

  useEffect(() => {
    latestViewRef.current = { id, name, properties };
  }, [id, name, properties]);

  useEffect(() => {
    if (disabled || trackedKeysRef.current.has(viewKey)) {
      return;
    }

    trackedKeysRef.current.add(viewKey);
    altertable.track(
      EVENT_SCREEN,
      buildViewProperties(latestViewRef.current, 'screen')
    );
  }, [altertable, disabled, viewKey]);
}

export type UseViewResult<TElement extends Element> = {
  /** Callback ref to attach to the root element of the view to track. */
  viewRef: (node: TElement | null) => void;
};

/**
 * Tracks a view when the referenced element becomes visible.
 *
 * Attach `viewRef` to the root element of the view to track.
 */
export function useView<TElement extends Element = HTMLElement>(
  name: string,
  options: ViewOptions = {}
): UseViewResult<TElement> {
  const altertable = useAltertableContext();
  const latestViewRef = useRef<TrackedView>({
    id: options.id,
    name,
    properties: options.properties,
  });
  const trackedKeysRef = useRef(new Set<string>());
  const [node, setNode] = useState<TElement | null>(null);

  const { disabled = false, id, properties, visibility } = options;
  const { root = null, rootMargin, threshold = 0 } = visibility ?? {};
  const viewKey = getViewKey(EVENT_VIEW, name, id);

  useEffect(() => {
    latestViewRef.current = { id, name, properties };
  }, [id, name, properties]);

  const trackView = useCallback(() => {
    if (trackedKeysRef.current.has(viewKey)) {
      return true;
    }

    trackedKeysRef.current.add(viewKey);
    altertable.track(
      EVENT_VIEW,
      buildViewProperties(latestViewRef.current, 'view')
    );

    return true;
  }, [altertable, viewKey]);

  const viewRef = useCallback((nextNode: TElement | null) => {
    setNode(nextNode);
  }, []);

  useEffect(() => {
    if (!node || disabled) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      logger.warnOnce(
        'useView() requires IntersectionObserver. Skipping view tracking because this browser does not support it.'
      );
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && trackView()) {
            observer.disconnect();
            break;
          }
        }
      },
      { root, rootMargin, threshold }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [disabled, node, root, rootMargin, threshold, trackView]);

  return useMemo(() => ({ viewRef }), [viewRef]);
}

function getViewKey(event: string, name: string, id?: string) {
  return [event, name, id ?? ''].join(':');
}

function buildViewProperties(view: TrackedView, type: ViewType) {
  return {
    ...view.properties,
    [PROPERTY_VIEW_NAME]: view.name,
    ...(view.id === undefined ? {} : { [PROPERTY_VIEW_ID]: view.id }),
    [PROPERTY_VIEW_TYPE]: type,
    [PROPERTY_LIB]: __LIB__,
    [PROPERTY_LIB_VERSION]: __LIB_VERSION__,
  };
}
