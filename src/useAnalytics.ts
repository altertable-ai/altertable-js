import { useCallback } from 'react';
import { FunnelMapping, FunnelStepNames, FunnelStepProperties } from './types';

export const useAnalytics = <T extends FunnelMapping>() => {
  const makeTrack = <Steps extends T[keyof T] = T[keyof T]>() => {
    return <Step extends FunnelStepNames<Steps>>(
      step: Step,
      properties: FunnelStepProperties<Steps, Step>
    ) => {
      // Replace this with your actual analytics tracking logic.
      console.log(`Tracking step: ${step}`, properties);
    };
  };

  const useFunnel = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    <FunnelName extends keyof T>(funnelName: FunnelName) => {
      const track = useCallback(makeTrack<T[FunnelName]>(), []);
      return { track };
    },
    []
  );

  const track = useCallback(makeTrack(), []);

  return {
    useFunnel,
    track,
  };
};
