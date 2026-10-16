import AsyncStorage from '@react-native-async-storage/async-storage';

let writesFailing = false;

export function setStorageWritesFailing(value: boolean) {
  writesFailing = value;
}

function assertWritesAvailable() {
  if (writesFailing) {
    throw new Error('[Example] Simulated native storage write failure.');
  }
}

/** Opt-in fault injection around the real native storage implementation. */
export const deliveryCheckStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  async setItem(key: string, value: string) {
    assertWritesAvailable();
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    assertWritesAvailable();
    await AsyncStorage.removeItem(key);
  },
};
