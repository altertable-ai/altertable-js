# @altertable/altertable-react-native

Altertable analytics for React Native and Expo. Restores identity, consent, and
unsent events before initialization; handles app state changes and offline replay;
provides React hooks and optional React Navigation screen tracking.

## Installation

```fish
npm install @altertable/altertable-react-native
```

Pass an async storage backend when creating a client. For Expo, install the
compatible AsyncStorage version:

```fish
npx expo install @react-native-async-storage/async-storage
```

For bare React Native, install AsyncStorage and follow its native installation
instructions. React Native 0.81+ and React 19.1+ are supported; the included example
uses Expo SDK 58, React Native 0.88, and React 19.3.

## Initialize once

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAltertable } from '@altertable/altertable-react-native';

const client = await createAltertable('YOUR_KEY', {
  storage: AsyncStorage,
  environment: 'production',
  onError: error => console.error(error),
});

client.track('Signup Started', { source: 'welcome' });
client.identify('user-123', { plan: 'pro' });
```

The factory resolves after restoring and saving identity and consent. Read or
initial write failures reject initialization; they do not silently create a new
identity. Render a loading/error state until the client is ready, as shown in the
[Expo example](../../examples/example-react-native).

Keep one active client per API key and environment for a given storage backend.
Create the client outside individual screen lifecycles. The SDK manages its own
AppState subscription; app foregrounding, backgrounding, and iOS inactivity trigger
best-effort flushes.

## React

```tsx
import {
  AltertableProvider,
  useAltertable,
} from '@altertable/altertable-react-native';
import { Button } from 'react-native';

function App() {
  return (
    <AltertableProvider client={client}>
      <Checkout />
    </AltertableProvider>
  );
}

function Checkout() {
  const analytics = useAltertable();
  return (
    <Button
      title="Purchase"
      onPress={() => analytics.track('Purchase Completed', { amount: 42 })}
    />
  );
}
```

The provider shares a ready client. It does not initialize or dispose it, so
remounting a subtree does not reset identity or remove application listeners.

## Screens and navigation

Track screens explicitly when your router reports a visit:

```tsx
client.screen('Checkout', {
  id: 'order-123',
  properties: { total: 42 },
});
```

This sends `$screen` with `$view_name`, `$view_type: 'screen'`, and optional
`$view_id`. Each call represents a visit. Track screen focus or navigation changes
rather than component mount: native navigators often keep screens mounted.

For React Navigation, attach the helper to your container ref:

```tsx
import { useEffect } from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import {
  trackNavigation,
  useAltertable,
} from '@altertable/altertable-react-native';

function Navigation() {
  const client = useAltertable();
  const navigation = useNavigationContainerRef();

  useEffect(() => trackNavigation(client, navigation), [client, navigation]);

  return (
    <NavigationContainer ref={navigation}>
      {/* Your navigators */}
    </NavigationContainer>
  );
}
```

The helper subscribes to `ready` and `state` events and returns cleanup. It tracks
the initial route, a change to the active route key, and a return to a previous
screen. Parameter changes on the same route do not create another visit. Route
parameters are not collected. The same ref interface works with React
Navigation's static API. React Navigation is not a package dependency.

Other routers, including Expo Router, can call `screen()` from their own route
change integration. Choose one screen tracking integration to avoid duplicates.

## Offline delivery

Identity and consent are always persisted. Unsent events are persisted by default,
including requests in flight, and replayed on restart. Writes are ordered and
coalesced so an old write cannot overwrite a newer deletion. Failed writes are
reported through `onError`; pending values remain available for a later retry.

The batcher flushes every 10 seconds, at 20 buffered payloads, and on app state
changes. It retains the core queue limits: 1,000 events, 512 KiB, and seven days.
Delivery is at least once; interruptions before acknowledgment can cause replay.
Native writes and background requests can be interrupted by process termination.

Optionally provide NetInfo for immediate retries when connectivity returns and to
suppress sends while known offline:

```tsx
import NetInfo from '@react-native-community/netinfo';

const client = await createAltertable('YOUR_KEY', {
  storage: AsyncStorage,
  connectivity: NetInfo,
});
```

Without a connectivity adapter, requests are attempted using the core retry logic.
The backend only needs `getItem`, `setItem`, and `removeItem` methods returning
promises. Neither AsyncStorage nor NetInfo is imported by the SDK.

```tsx
await client.flushPersistence(); // Wait for native writes; no network request.
await client.flush(); // Persist, attempt delivery, and persist the result.
```

An offline `flush()` resolves with events still queued. A storage failure rejects
these methods; calling them again retries pending writes. `track`, `identify`,
`alias`, and `updateTraits` remain synchronous. To keep events only in memory, set
`eventPersistence: false` at creation; this removes any previously persisted event
buffer while retaining identity and consent.

## Consent and logout

```tsx
await client.configure({ trackingConsent: 'granted' });
await client.configure({ trackingConsent: 'denied' });
await client.reset(); // Logout: clear buffered events and save a new identity.
```

Saved consent takes precedence over the initial default, which is `granted`.
Use `trackingConsent: 'pending'` at creation if your app must wait for a decision.
Events collected while pending or dismissed stay in memory until consent is
granted and do not survive restart. A grant is persisted before queued events can
be delivered. Denial removes queued events; await `configure()` to confirm native
storage has caught up. `reset()` preserves device ID and consent unless
`resetDeviceId: true` is passed.

## Configuration and disposal

Creation accepts core options for `baseUrl`, `environment`, `release`, `debug`,
`trackingConsent`, `transformEvent`, `onError`, `flushEventThreshold`,
`flushIntervalMs`, and `maxBatchSize`. Browser autocapture and browser storage
options are omitted. Track/screen events carry native `$lib`, `$lib_version`,
`$os`, and `$os_version` properties. Set `release` to include your app version.

`configure()` updates consent, release, debug, transformation, error handling, and
batch settings. It waits for native writes. API key, environment, backend, and
connectivity are fixed for a client's lifetime.

```tsx
await client.dispose();
```

Disposal removes native subscriptions, stops the batch timer, and saves outstanding
events without waiting for network delivery. Late requests from the disposed
client cannot overwrite a replacement client's storage. Calls to mutate or flush
a disposed client throw. Disposal is repeatable, including retrying failed final
writes; call it before replacing a client.
