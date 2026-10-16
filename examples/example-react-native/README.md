# React Native example

Expo SDK 58 example using AsyncStorage, NetInfo, and React Navigation. It restores
analytics before rendering the navigation tree, tracks screen visits and custom
events, and demonstrates identity reset.

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

To exercise recovery, identify the demo user, turn off connectivity, complete a
purchase, wait for the native writes, terminate the app, and reopen it. Restoring
connectivity should deliver the buffered purchase under the same identity. Test
backgrounding and returning to Home as well. Transport is at least once: events
whose acknowledgment is interrupted can be replayed after restart.

`bun run build` exports the Metro bundles for iOS and Android. It does not compile
or run native applications; verify lifecycle behavior on devices before release.
