type FunnelName = string;

export type FunnelStep = { name: FunnelName; properties?: Record<string, any> };

export type FunnelStepName<T extends readonly FunnelStep[]> = T[number]['name'];

export type FunnelStepProperties<
  T extends readonly FunnelStep[],
  N extends FunnelStepName<T>,
> = Extract<T[number], { name: N }>['properties'];

/**
 * Type for defining funnel configurations that map funnel names to their step definitions.
 *
 * This type is used to create type-safe funnel tracking in your application.
 * Each funnel is defined by a name (key) and an array of steps (value).
 *
 * @example
 * ```typescript
 * type MyFunnels = {
 *   signup: [
 *     { name: 'Email Entered'; properties: { email: string } },
 *     { name: 'Password Created'; properties: { strength: 'weak' | 'medium' | 'strong' } },
 *     { name: 'Account Created'; properties: { userId: string; plan: string } }
 *   ];
 *   checkout: [
 *     { name: 'Cart Viewed'; properties: { itemCount: number } },
 *     { name: 'Payment Info Entered'; properties: { paymentMethod: string } },
 *     { name: 'Order Completed'; properties: { orderId: string; total: number } }
 *   ];
 * };
 *
 * // Use with the useAltertable hook for type-safe tracking
 * const altertable = useAltertable<MyFunnels>();
 * const signupFunnel = altertable.selectFunnel('signup');
 * signupFunnel.trackStep('Email Entered', { email: 'user@example.com' });
 * ```
 */
export type FunnelMapping = Record<FunnelName, readonly FunnelStep[]>;
