import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, initializeAuth, type Persistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { app } from './app';

// Metro selects Firebase's React Native entry; its persistence helper is absent
// from the browser declarations used by the shared TypeScript configuration.
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};
function nativeAuth() {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch (error: any) {
    if (error.code === 'auth/already-initialized') return getAuth(app);
    throw error;
  }
}
export const auth = nativeAuth();
export const db = getFirestore(app);
