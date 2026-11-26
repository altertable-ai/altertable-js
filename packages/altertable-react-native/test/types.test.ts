import { expectTypeOf, it } from 'vitest';

import type {
  ReactNativeClient,
  ReactNativeConfig,
  ReactNativeConfigUpdates,
  useAltertable,
} from '../src';

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

type Funnels = {
  checkout: [
    { name: 'Cart Viewed'; properties: { itemCount: number } },
    { name: 'Order Completed'; properties: { total: number } },
  ];
};

it('types funnel tracking from the funnel mapping', () => {
  type Client = ReturnType<typeof useAltertable<Funnels>>;
  type Checkout = ReturnType<Client['selectFunnel']>;

  expectTypeOf<
    Parameters<Client['selectFunnel']>[0]
  >().toEqualTypeOf<'checkout'>();
  expectTypeOf<Parameters<Checkout['trackStep']>[0]>().toEqualTypeOf<
    'Cart Viewed' | 'Order Completed'
  >();
  expectTypeOf<Parameters<Client['track']>[0]>().toEqualTypeOf<
    'Cart Viewed' | 'Order Completed'
  >();
});

it('keeps the untyped hook usable as a client', () => {
  type Client = ReturnType<typeof useAltertable>;

  expectTypeOf<Client>().toExtend<ReactNativeClient>();
});
