import { keyBuilder } from '../constants';
import { createKeyBuilder } from './keyBuilder';

const storageKeyBuilder = createKeyBuilder('atbl2', '.');

type StorageKeys = { session: string; events: string };

/** Resolve API-key-scoped identity and event keys before hydrating a storage adapter. */
export function getStorageKeys(apiKey: string): StorageKeys;
/** @deprecated The environment argument is ignored. Use getStorageKeys(apiKey). */
export function getStorageKeys(
  apiKey: string,
  environment: string | undefined
): StorageKeys;
export function getStorageKeys(apiKey: string, _environment?: string) {
  return {
    session: storageKeyBuilder(apiKey),
    events: storageKeyBuilder(apiKey, 'events'),
  };
}

/** @internal Only for restoring data written by SDKs with environment-scoped storage. */
export function getLegacyStorageKeys(
  apiKey: string,
  environment = 'production'
) {
  return {
    session: keyBuilder(apiKey, environment),
    events: keyBuilder(apiKey, environment, 'events'),
  };
}
