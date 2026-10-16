import { useAltertable } from '@altertable/altertable-react-native';
import { useState } from 'react';
import { Button, Switch, Text, TextInput, View } from 'react-native';

import { setStorageWritesFailing } from './deliveryCheckStorage';

/** Manual checks use the same client and native storage as the example app. */
export function DeliveryChecks() {
  const client = useAltertable();
  const [eventName, setEventName] = useState('Offline Restart');
  const [writesFailing, setWritesFailing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [consent, setConsent] = useState(client.getTrackingConsent());

  async function run(label: string, operation: () => Promise<void>) {
    setBusy(true);
    setStatus(`${label}…`);

    try {
      await operation();
      setStatus(`${label}: complete`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setConsent(client.getTrackingConsent());
      setBusy(false);
    }
  }

  const actions = [
    {
      label: 'Track and save event',
      operation: async () => {
        client.track(eventName);
        await client.flushPersistence();
      },
    },
    ...['delivery-user-a', 'delivery-user-b'].map(userId => ({
      label: `Identify ${userId}`,
      operation: async () => {
        client.identify(userId);
        await client.flushPersistence();
      },
    })),
    ...(['granted', 'denied', 'pending'] as const).map(trackingConsent => ({
      label: `Set consent ${trackingConsent}`,
      operation: () => client.configure({ trackingConsent }),
    })),
    { label: 'Logout and save', operation: () => client.reset() },
    {
      label: 'Retry native writes',
      operation: () => client.flushPersistence(),
    },
    { label: 'Flush delivery', operation: () => client.flush() },
  ];

  return (
    <View style={{ gap: 12 }}>
      <Text>Delivery checks · Consent: {consent}</Text>
      <TextInput
        accessibilityLabel="Test event name"
        value={eventName}
        onChangeText={setEventName}
        editable={!busy}
        style={{ borderWidth: 1, padding: 12 }}
      />
      <Text>Simulate storage write failures</Text>
      <Switch
        accessibilityLabel="Simulate storage write failures"
        value={writesFailing}
        disabled={busy}
        onValueChange={value => {
          setStorageWritesFailing(value);
          setWritesFailing(value);
        }}
      />
      {actions.map(({ label, operation }) => (
        <Button
          key={label}
          title={label}
          disabled={busy || !eventName.trim()}
          onPress={() => {
            void run(label, operation);
          }}
        />
      ))}
      <Text accessibilityLiveRegion="polite">{status}</Text>
      <Text>
        Save waits for native writes, not server delivery. Pending consent
        events remain in memory only.
      </Text>
    </View>
  );
}
