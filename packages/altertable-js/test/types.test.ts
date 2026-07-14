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
