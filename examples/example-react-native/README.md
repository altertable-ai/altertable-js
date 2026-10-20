# React Native example

Expo SDK 58 example using AsyncStorage, NetInfo, and React Navigation. It restores
analytics before rendering the navigation tree, provides loading/error/retry
states, tracks screen visits and custom events, and demonstrates identity reset.

This is a workspace development example: it always uses the local SDK.
The isolated packed-consumer fixtures in `scripts/react-native` qualify the
publishable artifacts without workspace links.

From the repository root:

```sh
bun install
bun run --filter @altertable/altertable-js --filter @altertable/altertable-react-native build
cd examples/example-react-native
echo 'EXPO_PUBLIC_ALTERTABLE_API_KEY=YOUR_KEY' > .env.local
bun run dev
```

Open the app in a compatible Expo Go client or an iOS/Android development build.
The key is bundled into the app, so use an event-ingestion key intended for clients.

To test offline restarts, background/resume, account switching, consent, and storage
failures, follow [the device delivery checks](./DELIVERY_CHECKS.md). The optional
controls use the real AsyncStorage backend. Ordinary example startup passes
AsyncStorage directly to the SDK.

The example supplies NetInfo through the optional `connectivity` option for
immediate retries on reconnection. NetInfo is an example dependency; the SDK does
not import or depend on it. Apps can omit it and rely on the batch interval and
app state changes.

`bun run build` exports the Metro bundles for iOS and Android. It does not compile
or run native applications; verify lifecycle behavior on devices before release.
