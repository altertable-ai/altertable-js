// A generic funnel step has a name and properties.
export type FunnelStep = { name: string; properties: any };

// Extracts a union of all step names from a funnel's steps array.
export type FunnelStepNames<T extends readonly FunnelStep[]> =
  T[number]['name'];

// Given a funnel's steps and a step name, extract the expected properties.
export type FunnelStepProperties<
  T extends readonly FunnelStep[],
  N extends FunnelStepNames<T>,
> = Extract<T[number], { name: N }>['properties'];

// The funnel mapping: keys are funnel names; values are arrays of funnel steps.
export type FunnelMapping = Record<string, readonly FunnelStep[]>;
