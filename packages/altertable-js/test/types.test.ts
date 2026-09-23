import { expectTypeOf, test } from 'vitest';

import type {
  AltertableConfig,
  EventProperties,
  TrackPayload,
  TransformEvent,
} from '../src';

test('exports the transformEvent public types', () => {
  expectTypeOf<AltertableConfig['transformEvent']>().toEqualTypeOf<
    TransformEvent | undefined
  >();
  expectTypeOf<Parameters<TransformEvent>[0]>().toEqualTypeOf<TrackPayload>();
  expectTypeOf<
    ReturnType<TransformEvent>
  >().toEqualTypeOf<TrackPayload | null>();
  expectTypeOf<TrackPayload['properties']>().toEqualTypeOf<EventProperties>();
});

test('exports adapter capabilities without requiring a provider dependency', () => {
  expectTypeOf<AltertableConfig['adapters']>().toEqualTypeOf<
    import('../src').Adapters | undefined
  >();
  expectTypeOf<
    NonNullable<AltertableConfig['adapters']>['posthog']
  >().toEqualTypeOf<import('../src').PostHogAdapter | undefined>();
});

test('keeps timestamps in normalized adapter operations', () => {
  expectTypeOf<
    import('../src/adapters/types').AdapterEvent['payload']['timestamp']
  >().toEqualTypeOf<string>();
});

test('requires a subscription for every configured provider', () => {
  expectTypeOf<
    Exclude<keyof import('../src/adapters/types').AdapterInstances, 'posthog'>
  >().toEqualTypeOf<never>();
});
