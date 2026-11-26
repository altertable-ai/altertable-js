import type { EventProperties } from '@altertable/altertable-js';

/**
 * Merges the property layers of an event tracked through a React binding, from
 * lowest to highest precedence. The binding's `$lib` and `$lib_version` are
 * applied last so they override the values reported by the core library.
 */
export function mergeEventProperties(
  ...layers: Array<EventProperties | undefined>
): EventProperties {
  const properties: EventProperties = {};

  for (const layer of layers) {
    Object.assign(properties, layer);
  }

  properties.$lib = __LIB__;
  properties.$lib_version = __LIB_VERSION__;

  return properties;
}
