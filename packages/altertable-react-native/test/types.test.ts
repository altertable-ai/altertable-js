import { expectTypeOf, it } from 'vitest';

import type { ReactNativeConfig, ReactNativeConfigUpdates } from '../src';

it('omits browser and immutable runtime options', () => {
  expectTypeOf<{ mode: 'audience' }>().toExtend<ReactNativeConfig>();
  expectTypeOf<{ mode: 'product' }>().not.toExtend<ReactNativeConfig>();
  expectTypeOf<{}>().not.toExtend<ReactNativeConfig>();
  expectTypeOf<ReactNativeConfig>().not.toHaveProperty('autoCapture');
  expectTypeOf<ReactNativeConfig>().not.toHaveProperty('adapters');
  expectTypeOf<ReactNativeConfigUpdates>().not.toHaveProperty('environment');
  expectTypeOf<ReactNativeConfigUpdates>().not.toHaveProperty('mode');
  expectTypeOf<ReactNativeConfigUpdates>().not.toHaveProperty('storage');
});
