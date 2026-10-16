import type NetInfo from '@react-native-community/netinfo';
import { expectTypeOf, it } from 'vitest';

import type {
  Connectivity,
  ReactNativeConfig,
  ReactNativeConfigUpdates,
} from '../src';

it('accepts NetInfo without exposing browser or immutable runtime options', () => {
  expectTypeOf<typeof NetInfo>().toExtend<Connectivity>();
  expectTypeOf<ReactNativeConfig>().not.toHaveProperty('autoCapture');
  expectTypeOf<ReactNativeConfig>().not.toHaveProperty('adapters');
  expectTypeOf<ReactNativeConfigUpdates>().not.toHaveProperty('environment');
  expectTypeOf<ReactNativeConfigUpdates>().not.toHaveProperty('storage');
});
