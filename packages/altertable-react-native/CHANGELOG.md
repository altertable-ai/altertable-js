# Changelog

## [1.4.0](https://github.com/altertable-ai/altertable-js/compare/altertable-react-native-v1.3.1...altertable-react-native-v1.4.0) (2026-10-19)

### Features

- Select the environment from the API key. The `environment` option is deprecated and ignored for routing. ([#215](https://github.com/altertable-ai/altertable-js/pull/215))
- Migrate saved identity, consent, and unsent events after confirming native storage writes.

### Dependencies

- Update `@altertable/altertable-js` to `^1.4.0`.

## [1.3.1](https://github.com/altertable-ai/altertable-js/releases/tag/altertable-react-native-v1.3.1) (2026-10-19)

Initial release of the Altertable React Native SDK for iOS and Android, with an
[Expo example app](../../examples/example-react-native) to help you get started.

### Features

- **Ready before rendering:** `await createAltertable()` restores identity, consent,
  and queued events before returning a client. Storage initialization failures reject
  the promise so your app can show an error and retry.
- **React integration:** Share one client with `AltertableProvider` and access it
  from components with `useAltertable()`.
- **Screen tracking:** Record visits with `screen()`, or use `trackNavigation()` to
  track active routes in React Navigation without copying route parameters.
- **Offline delivery:** Persist unsent events across app restarts and retry on app
  state changes. Optionally connect your network status subscription to retry on
  reconnection; no connectivity library is required.
- **Consent and client lifecycle:** Update consent with `configure()`, clear identity
  and unsent events with `reset()`, await storage writes with `flushPersistence()`,
  and clean up listeners and timers with `dispose()`.

### Getting started

Requires React Native 0.81+ and React 19.1+. Follow the
[installation steps](./README.md#installation) for Expo or bare React Native, then
initialize once during app startup:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAltertable } from '@altertable/altertable-react-native';

async function initializeAnalytics() {
  const client = await createAltertable('YOUR_API_KEY', {
    storage: AsyncStorage,
    onError: error => console.error(error),
  });

  client.track('App Opened');
  return client;
}
```

Await initialization before rendering components that use analytics. See the
[API reference](./README.md#api-reference) for providers, screen tracking, consent,
and cleanup.

### Dependencies

- Uses `@altertable/altertable-js` ^1.3.1 for shared tracking and delivery behavior.
