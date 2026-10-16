import {
  AltertableProvider,
  createAltertable,
  type ReactNativeClient,
  trackNavigation,
  useAltertable,
} from '@altertable/altertable-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Button, SafeAreaView, StyleSheet, Text, View } from 'react-native';

type Routes = { Home: undefined; Checkout: undefined };
const Stack = createNativeStackNavigator<Routes>();
let initialization: Promise<ReactNativeClient> | undefined;

function initialize() {
  const apiKey = process.env.EXPO_PUBLIC_ALTERTABLE_API_KEY;
  if (!apiKey)
    return Promise.reject(
      new Error(
        'Set EXPO_PUBLIC_ALTERTABLE_API_KEY in .env.local and restart Expo.'
      )
    );
  initialization ??= createAltertable(apiKey, {
    storage: AsyncStorage,
    connectivity: NetInfo,
    environment: 'development',
    onError: console.error,
  });
  return initialization;
}

export default function App() {
  const [client, setClient] = useState<ReactNativeClient>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let mounted = true;
    void initialize()
      .then(ready => {
        if (mounted) setClient(ready);
        return;
      })
      .catch((cause: unknown) => {
        if (mounted)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!client)
    return (
      <SafeAreaView style={styles.container}>
        <Text>{error ?? 'Restoring analytics…'}</Text>
      </SafeAreaView>
    );
  return (
    <AltertableProvider client={client}>
      <Navigation />
    </AltertableProvider>
  );
}

function Navigation() {
  const client = useAltertable();
  const navigation = useNavigationContainerRef<Routes>();
  useEffect(() => trackNavigation(client, navigation), [client, navigation]);
  return (
    <NavigationContainer ref={navigation}>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="Checkout" component={Checkout} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function Home({ navigation }: NativeStackScreenProps<Routes, 'Home'>) {
  const client = useAltertable();
  const [status, setStatus] = useState('');
  async function reset() {
    await client.reset();
    setStatus('Identity reset and saved');
  }
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Altertable on React Native</Text>
      <Button
        title="Identify demo user"
        onPress={() => {
          client.identify('demo-user');
          setStatus('Identified');
        }}
      />
      <Button
        title="Open checkout"
        onPress={() => navigation.navigate('Checkout')}
      />
      <Button
        title="Reset identity"
        onPress={() => {
          void reset().catch(console.error);
        }}
      />
      <Text>{status}</Text>
    </View>
  );
}

function Checkout() {
  const client = useAltertable();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Checkout</Text>
      <Button
        title="Complete purchase"
        onPress={() =>
          client.track('Purchase Completed', { amount: 42, currency: 'EUR' })
        }
      />
      <Text>Navigate back to verify another Home screen view.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '600' },
});
