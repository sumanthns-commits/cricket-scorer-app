import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, initializeAuth, connectAuthEmulator, type Auth, type Persistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// getReactNativePersistence is only exported in @firebase/auth's React Native
// build (resolved by Metro at runtime). TypeScript's browser types don't include
// it, so we pull it via require to avoid a type error.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getReactNativePersistence } = require('@firebase/auth') as { getReactNativePersistence: (s: typeof AsyncStorage) => Persistence };
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { EMULATOR_HOST } from './emulatorHost';

// Cloud Functions are deployed to australia-southeast1 (see functions setGlobalOptions).
const FUNCTIONS_REGION = 'australia-southeast1';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  authDomain: `${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  storageBucket: `${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  // Required by the firebase/ai SDK (Gemini) — without it getAI() throws
  // "no appId in local Firebase config".
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ignoreUndefinedProperties lets us write objects with absent optional fields
// (e.g. ClubRules.oversPerInnings) without Firestore rejecting `undefined`.
// initializeFirestore throws if Firestore was already started (e.g. on Fast
// Refresh re-running this module), so fall back to the existing instance.
function createDb(): Firestore {
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    return getFirestore(app);
  }
}

// initializeAuth with AsyncStorage persistence so the ID token survives
// across sessions and refreshes correctly on React Native.
// Falls back to getAuth on Fast Refresh (initializeAuth throws if called twice).
function createAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const db = createDb();
export const auth = createAuth();
export const functions = getFunctions(app, FUNCTIONS_REGION);

let emulatorsConnected = false;

if (process.env.EXPO_PUBLIC_USE_EMULATOR === 'true' && !emulatorsConnected) {
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`);
  connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
  emulatorsConnected = true;
}
