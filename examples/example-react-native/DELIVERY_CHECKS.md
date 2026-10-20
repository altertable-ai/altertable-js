# Device delivery checks

Run these checks on both iOS and Android with a dedicated development project.
Use an installed development/release build that can cold-start without Metro for
offline restart checks. A JavaScript reload or Fast Refresh is not process
termination. Do not clear app data between steps unless explicitly instructed.

Add this to the example's `.env.local`, alongside the development API key, and
restart Expo/rebuild if necessary:

```sh
EXPO_PUBLIC_ALTERTABLE_DELIVERY_CHECKS=1
```

Home now exposes named test events, two accounts, consent controls, persistence
retry, and a switch that rejects native writes. Reads still use real AsyncStorage;
successful writes and removals do too. Consent starts pending on fresh storage;
saved consent takes precedence. Grant consent before testing delivery.

Verify received events in the development project's events view or ingestion
logs. A completed save confirms local persistence only. A completed offline flush
does not confirm server receipt. Record device/OS, app build, SDK commit, unique
event names, received identities, and pass/fail for each journey.

## Offline restart

1. Grant consent and identify `delivery-user-a`.
2. Disable all connectivity. Enter a unique event name and press **Track and save
   event**. Wait for completion.
3. Force-terminate the application without logging out or disposing the client.
4. Reopen while offline, then restore connectivity. Allow the next 10-second batch
   interval to attempt delivery.
5. Confirm the named event arrives under `delivery-user-a`. Repeat with an
   anonymous event after **Logout and save**; confirm anonymous and device identity
   remain the same across the restart.

## Background and resume

1. While offline, track and save another uniquely named event.
2. Send the app to the background and restore connectivity.
3. Return to the app. Confirm the event arrives without pressing **Flush delivery**.
4. Repeat with connectivity enabled when backgrounding. Background delivery is
   best effort; if the OS interrupts it, the event must recover on resume/restart.

## Account switching

1. Identify A, go offline, and save an event named `A before switch <run>`.
2. Identify B and save `B after switch <run>`. The SDK deliberately clears A's
   unsent backlog when switching identified accounts.
3. Force-terminate, reopen, and reconnect. Confirm only B's named event arrives,
   with B's identity. Neither event may be attributed to the other account.
4. Repeat using **Logout and save** between accounts. Device ID and consent should
   remain stable; the logged-out anonymous identity should be new.

## Consent changes

1. While offline with granted consent, save `Before denial <run>`.
2. Set consent denied and wait for completion. Force-terminate and reopen offline.
3. Confirm consent is still denied. Track `While denied <run>`, then reconnect.
   Neither named event should arrive.
4. Grant consent and track `After grant <run>`. Only this event should arrive.
5. Set consent pending, track `Pending then grant <run>`, and grant consent without
   restarting. Confirm delivery after the grant.
6. Repeat with `Pending then restart <run>`, but terminate before granting. Reopen
   and grant consent. This event must not arrive: pending events are memory-only.

## Storage write failures

1. While offline with granted consent, enable **Simulate storage write failures**.
2. Track a named event. Confirm the operation reports a storage error rather than
   claiming it was saved.
3. Restore connectivity with writes still blocked. Confirm the event is not sent.
4. Disable the switch, press **Retry native writes**, and then **Flush delivery**.
   Confirm the event arrives under the original identity.
5. Repeat by denying consent while writes are blocked. The operation must report
   an error. Disable the switch and retry native writes before terminating;
   confirm denial survives restart and the old backlog never reappears.

A failed write is not durable. Terminating before a successful retry can lose the
latest change. The failure switch itself resets when the process restarts.

## Interrupted requests

For a controlled check, use a test ingestion endpoint or network proxy that can
record an accepted request and hold its response. After it receives a named event,
terminate the application before acknowledging the request, then reopen normally.
Confirm the event remains recoverable with its original identity. Duplicate receipt
is permitted: delivery is at least once. Record this check as untested if response
interruption cannot be controlled; toggling airplane mode alone is not proof.

## Runtime qualification

CI installs packed core/native SDK artifacts into isolated fixtures, then checks
TypeScript and Metro bundles for both platforms. Run the same checks from the
repository root after building both SDK packages:

```sh
bun run --filter @altertable/altertable-js --filter @altertable/altertable-react-native build
bun run check:react-native minimum
bun run check:react-native current
```

The minimum fixture uses RN 0.81.0 / React 19.1.0; the current fixture reads the
example's versions. It uses the actual React Native package, with no native API
mocks. Temporary installations are removed after each run.

Bundling does not execute AppState or native storage. Before release, run the
journeys above on both platforms using a cold-start-capable app built against
each runtime.

## Record results

Record each journey separately for iOS and Android. Attach received event names,
identities, and any errors to the result; leave unavailable checks marked untested.
Unit tests mock native APIs. Metro exports validate bundling, not native storage,
OS lifecycle behavior, or delivery after process termination.
