import { useCallback, useMemo } from 'react';

import { useAltertableContext } from './AltertableProvider';
import { PROPERTY_LIB, PROPERTY_LIB_VERSION } from './constants';
import { FunnelMapping, FunnelStepName, FunnelStepProperties } from './types';

export function useAltertable<T extends FunnelMapping>() {
  const altertable = useAltertableContext();

  const track = useCallback(
    <Steps extends T[keyof T] = T[keyof T]>(
      eventName: FunnelStepName<Steps>,
      properties: FunnelStepProperties<Steps, typeof eventName> = {}
    ) => {
      altertable.track(eventName, {
        ...properties,
        // The React library needs to override the lib properties coming from
        // the core library
        [PROPERTY_LIB]: __LIB__,
        [PROPERTY_LIB_VERSION]: __LIB_VERSION__,
      });
    },
    [altertable]
  );

  const useFunnel = useCallback(
    <FunnelName extends keyof T>(_funnelName: FunnelName) => ({
      track: track<T[FunnelName]>,
    }),
    [track]
  );

  return useMemo(
    () => ({
      configure: altertable.configure.bind(altertable),
      getTrackingConsent: altertable.getTrackingConsent.bind(altertable),
      identify: altertable.identify.bind(altertable),
      page: altertable.page.bind(altertable),
      reset: altertable.reset.bind(altertable),
      track,
      updateTraits: altertable.updateTraits.bind(altertable),
      useFunnel,
    }),
    [altertable, track, useFunnel]
  );
}
