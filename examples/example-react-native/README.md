# React Native example

Expo SDK 58 example using AsyncStorage and React Navigation. It restores
analytics before rendering the navigation tree, provides loading/error/retry
states, tracks screen visits and custom events, and demonstrates identity reset.

From the repository root:

```sh
bun install
bun run build --scope=@altertable/altertable-js --scope=@altertable/altertable-react-native
cd examples/example-react-native
echo 'EXPO_PUBLIC_ALTERTABLE_API_KEY=YOUR_KEY' > .env.local
bun run dev
```

Open the app in a compatible Expo Go client or an iOS/Android development build.
The key is bundled into the app, so use an event-ingestion key intended for clients.

To test offline restarts, background/resume, account switching, consent, and storage
failures, follow [the device delivery checks](./DELIVERY_CHECKS.md). The optional
controls use the real AsyncStorage backend. Ordinary example startup passes
AsyncStorage directly to the SDK. Delivery retries on the batch interval and app
state changes; no network status dependency is required.

`bun run build` exports the Metro bundles for iOS and Android. It does not compile
or run native applications; verify lifecycle behavior on devices before release.
