// Structurally identical to the core `EventProperties`. This module sits below
// the core package, so it cannot import core types.
type EventProperties = Record<string, unknown>;

export const EVENT_PAGEVIEW = '$pageview';

export const PROPERTY_LIB = '$lib';
export const PROPERTY_URL = '$url';
export const PROPERTY_LIB_VERSION = '$lib_version';

export const EVENT_SCREEN = '$screen';
export const EVENT_VIEW = '$view';

type ViewType = 'screen' | 'view';

/**
 * Merges the property layers of an event, from lowest to highest precedence.
 * The bundling package's `$lib` and `$lib_version` are applied last so they
 * override the values reported by the core library.
 */
export function mergeEventProperties(
  ...layers: Array<EventProperties | undefined>
): EventProperties {
  const properties: EventProperties = {};

  for (const layer of layers) {
    Object.assign(properties, layer);
  }

  properties[PROPERTY_LIB] = __LIB__;
  properties[PROPERTY_LIB_VERSION] = __LIB_VERSION__;

  return properties;
}

/** Returns the properties that identify a `$screen` or `$view` event. */
export function getViewProperties({
  name,
  id,
  type,
}: {
  name: string;
  id?: string;
  type: ViewType;
}): EventProperties {
  return {
    $view_name: name,
    ...(id === undefined ? {} : { $view_id: id }),
    $view_type: type,
  };
}
