type FunnelName = string;

export type FunnelStep = { name: FunnelName; properties?: Record<string, any> };

// Extracts a union of all step names from a funnel's steps array.
export type FunnelStepName<T extends readonly FunnelStep[]> = T[number]['name'];

// Given a funnel's steps and a step name, extract the expected properties.
export type FunnelStepProperties<
  T extends readonly FunnelStep[],
  N extends FunnelStepName<T>,
> = Extract<T[number], { name: N }>['properties'];

export type FunnelMapping = Record<FunnelName, readonly FunnelStep[]>;
