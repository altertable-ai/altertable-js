import { useCallback } from 'react';
import { FunnelMapping, FunnelStepNames, FunnelStepProperties } from './types';
import type { Altertable } from '@altertable-ai/analytics.js';

export const useAnalytics = <T extends FunnelMapping>() => {
  const instance = window.Altertable as Altertable;

  const makeTrack = <Steps extends T[keyof T] = T[keyof T]>() => {
    return <Step extends FunnelStepNames<Steps>>(
      step: Step,
      properties: FunnelStepProperties<Steps, Step>
    ) => {
      try {
        instance.track(step, properties);
      } catch (error) {
        console.error('Failed to track event', error);
      }
    };
  };

  const useFunnel = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    <FunnelName extends keyof T>(_funnelName: FunnelName) => {
      const track = useCallback(makeTrack<T[FunnelName]>(), []);
      return { track };
    },
    []
  );

  const track = useCallback(makeTrack(), []);

  const identify = useCallback((userId: string) => {
    try {
      instance.identify(userId);
    } catch (error) {
      console.error('Failed to identify user', error);
    }
  }, []);

  return {
    useFunnel,
    identify,
    track,
  };
};
