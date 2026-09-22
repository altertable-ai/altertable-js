import { PostHogSubscription } from './posthog';
import type { AdapterIngress, AdapterSubscription } from './subscription';
import type { AdapterInstances, Adapters } from './types';

type AdapterSubscriptionFactories = {
  [Name in keyof AdapterInstances]: (
    ingress: AdapterIngress
  ) => AdapterSubscription;
};

const adapterSubscriptionFactories: AdapterSubscriptionFactories = {
  posthog(ingress) {
    const subscription = new PostHogSubscription(ingress);
    return {
      update(adapters) {
        subscription.update(adapters?.posthog);
      },
      dispose() {
        subscription.dispose();
      },
    };
  },
};

export function hasConfiguredAdapter(adapters: Adapters | undefined) {
  return Object.values(adapters ?? {}).some(adapter => adapter != null);
}

export function connectAdapters(ingress: AdapterIngress): AdapterSubscription {
  const subscriptions = Object.values(adapterSubscriptionFactories).map(
    createSubscription => createSubscription(ingress)
  );

  return {
    update(adapters) {
      subscriptions.forEach(subscription => subscription.update(adapters));
    },
    dispose() {
      subscriptions.forEach(subscription => subscription.dispose());
    },
  };
}
