import { keyBuilder } from '../constants';

/** Resolve the identity and event keys before hydrating a custom storage adapter. */
export function getStorageKeys(apiKey: string, environment = 'production') {
  return {
    session: keyBuilder(apiKey, environment),
    events: keyBuilder(apiKey, environment, 'events'),
  };
}
