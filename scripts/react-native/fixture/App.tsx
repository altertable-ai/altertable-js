import {
  AltertableProvider,
  createAltertable,
  type AsyncStorageAdapter,
  type ReactNativeClient,
  useAltertable,
} from '@altertable/altertable-react-native';
import { Text } from 'react-native';

const values = new Map<string, string>();
const storage: AsyncStorageAdapter = {
  getItem: async key => values.get(key) ?? null,
  setItem: async (key, value) => {
    values.set(key, value);
  },
  removeItem: async key => {
    values.delete(key);
  },
};

export function initialize() {
  return createAltertable('qualification', {
    storage,
    trackingConsent: 'pending',
  });
}

function Screen() {
  const client = useAltertable();

  return (
    <Text onPress={() => client.track('Pressed')}>Runtime compatibility</Text>
  );
}

export function App({ client }: { client: ReactNativeClient }) {
  return (
    <AltertableProvider client={client}>
      <Screen />
    </AltertableProvider>
  );
}
