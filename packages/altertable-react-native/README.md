# @altertable/altertable-react-native

React Native SDK for capturing and sending analytics events to Altertable.

## Installation

```sh
npm install @altertable/altertable-react-native
# or
pnpm add @altertable/altertable-react-native
# or
yarn add @altertable/altertable-react-native
# or
bun add @altertable/altertable-react-native
```

Install an async storage backend. For Expo:

```sh
npx expo install @react-native-async-storage/async-storage
```

For bare React Native:

```sh
npm install @react-native-async-storage/async-storage
npx pod-install
```

Requires React Native 0.81+ and React 19.1+. CI checks the minimum and example
versions with packed-package typechecks and iOS/Android bundles. See the
[runtime qualification checks](../../examples/example-react-native/DELIVERY_CHECKS.md#runtime-qualification)
for device validation instructions.

## Quick Start

Initialize once from your app's async startup, then share the ready client:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAltertable } from '@altertable/altertable-react-native';

async function initializeAnalytics() {
  const client = await createAltertable('YOUR_API_KEY', {
    storage: AsyncStorage,
    onError: error => console.error(error),
  });

  client.identify('user-123', { plan: 'pro' });

  return client;
}
```

Await initialization before rendering components that use analytics. It restores
identity, consent, and unsent events, and rejects if storage cannot be read or
initialized. See the [Expo example](../../examples/example-react-native) for a
complete app with loading, error, and retry states. Failed initialization can be
retried by calling `createAltertable()` again with the same storage.

## Features

- Persistent identity and offline event delivery
- Delivery on background/resume and optional connectivity recovery
- React provider and tracking hook
- Screen tracking with optional React Navigation integration

## API Reference

### React integration

```tsx
import { Button } from 'react-native';
import {
  AltertableProvider,
  type ReactNativeClient,
  useAltertable,
} from '@altertable/altertable-react-native';

function App({ client }: { client: ReactNativeClient }) {
  return (
    <AltertableProvider client={client}>
      <Checkout />
    </AltertableProvider>
  );
}

function Checkout() {
  const client = useAltertable();

  return (
    <Button
      title="Purchase"
      onPress={() => client.track('Purchase Completed', { amount: 42 })}
    />
  );
}
```

The provider shares the client without reinitializing it. Tracking and identity
methods follow the [core SDK API](../altertable-js/README.md#api-reference).
`reset()` and `configure()` also wait for native writes:

```tsx
await client.configure({ trackingConsent: 'granted' });
await client.reset(); // Logout: clear unsent events and save a new identity.
```

Saved consent takes precedence over the creation default (`granted`). Use
`trackingConsent: 'pending'` to wait for a decision on first initialization.
Pending events stay in memory until granted; denial clears queued events. Reset
and account switching clear unsent events while preserving device ID and consent.

### Screen tracking

Call `screen()` when a screen becomes active:

```tsx
client.screen('Checkout', {
  id: 'order-123',
  properties: { total: 42 },
});
```

It sends `$screen` with `$view_name`, `$view_type`, and optional `$view_id`.
For React Navigation, attach `trackNavigation(client, navigationRef)` inside an
effect and return its cleanup. Pass the object returned by
`useNavigationContainerRef()` directly. The `NavigationSource` type describes the
required navigation methods. It tracks the initial route and subsequent active
route changes. The [Expo example](../../examples/example-react-native/App.tsx)
shows the full integration. It tracks route names; route parameters are not copied
into events. Use manual `screen()` calls when you need custom IDs or properties,
and choose one tracking method to avoid duplicate visits.

### Offline delivery and cleanup

Events persist by default and retry after restart. The SDK attempts delivery every
10 seconds, at 20 buffered payloads, and on app state changes. Delivery is at least
once; OS suspension can interrupt background writes or requests.

No connectivity dependency is required. Failed requests retry on the next batch
interval or app state change. Apps that already observe network status can pass an
optional `connectivity` subscription to retry immediately on reconnection. The
[Expo example](../../examples/example-react-native/App.tsx) demonstrates this with
NetInfo, which is an example dependency only.

```tsx
await client.flushPersistence(); // Wait for native writes without sending.
await client.flush(); // Persist and attempt delivery; events stay queued offline.
await client.dispose(); // Stop listeners/timers and persist remaining events.
```

Keep one active client per API key, environment, and storage backend. Dispose it
before creating a replacement. Storage failures reach `onError` and reject awaited
operations; a later flush retries pending writes. Native storage and subscription
failures also produce a console warning, deduplicated for each client.

## Runtime integration

The native SDK supplies event context, AppState lifecycle notifications, optional
connectivity, and storage preparation through the core SDK's `Platform` contract.
Each delivery snapshot waits for native writes before starting its request;
overlapping lifecycle and interval triggers share pending delivery work.

For custom runtime integrations, see the core SDK's
[runtime platform API](../altertable-js/README.md#runtime-platforms).

## Types

### `ReactNativeConfig`

Accepts core options for API endpoint, environment, release, consent, transformation,
error handling, and batching, plus:

| Option             | Required | Default | Description                                                       |
| ------------------ | -------- | ------- | ----------------------------------------------------------------- |
| `storage`          | Yes      | —       | Async backend with `getItem`, `setItem`, and `removeItem`.        |
| `eventPersistence` | No       | `true`  | Persist unsent events. Identity and consent are always persisted. |
| `connectivity`     | No       | —       | Optional app-provided network status subscription.                |

`configure()` updates consent, release, debug, transformation, error handling, and
batch settings. API key, `baseUrl`, environment, storage, connectivity, and
`eventPersistence` are fixed at creation. See the [core configuration reference](../altertable-js/README.md#altertableconfig)
for shared options.

## License

[MIT](./LICENSE)
