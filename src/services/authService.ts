import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { db, auth } from './firebase';
import { unregisterPushTokenAsync } from './pushTokenService';
import { callCallableFunction } from './functionsClient';

export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

/**
 * Apple's identityToken JWT already carries the email claim (Firebase
 * extracts it into user.email automatically, same as Google), but NOT a
 * name claim — Apple only hands back `fullName` out-of-band, and only on
 * the very first authorization ever granted to this app. Without patching
 * displayName in here, there's no later opportunity to backfill it.
 */
export async function signInWithAppleCredential(
  identityToken: string,
  rawNonce: string,
  fullName?: { givenName?: string | null; familyName?: string | null } | null
): Promise<User> {
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({ idToken: identityToken, rawNonce });
  const result = await signInWithCredential(auth, credential);

  const displayName = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ');
  if (displayName) {
    await updateProfile(result.user, { displayName });
    // Written directly rather than left to initializeUserDocs' create-only-
    // if-missing check — that runs from a separate onAuthStateChanged
    // listener that races this function, so whichever finishes first must
    // not leave users/{uid} with a blank name.
    await setDoc(doc(db, 'users', result.user.uid), { displayName }, { merge: true });
  }

  return result.user;
}

/**
 * Dev-only sign-in against the Auth emulator. The emulator accepts any
 * credentials with no real OAuth, so we sign in if the account exists and
 * auto-create it (with a display name) on first use. NEVER call in production.
 */
export async function signInWithEmulatorCredentials(
  email: string,
  password: string
): Promise<User> {
  if (process.env.EXPO_PUBLIC_USE_EMULATOR !== 'true') {
    throw new Error('Emulator sign-in is only available in emulator mode');
  }

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err) {
    if (err instanceof FirebaseError && err.code === 'auth/user-not-found') {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: email.split('@')[0] });
      return result.user;
    }
    throw err;
  }
}

export async function signOut(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid) {
    await unregisterPushTokenAsync(uid);
  }
  if (process.env.EXPO_PUBLIC_USE_EMULATOR !== 'true') {
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch {
      // non-fatal — Firebase sign-out still clears the session
    }
  }
  await firebaseSignOut(auth);
}

/**
 * Deletes the signed-in user's account: the deleteAccount Cloud Function
 * ghosts their player doc in every club (careerStats untouched, mirroring
 * leaveClub), then erases users/{uid}, userMemberships/{uid}, and the
 * Firebase Auth user. Push token is unregistered first — it writes to
 * users/{uid}, which no longer exists once the callable returns.
 */
export async function deleteAccount(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid) {
    await unregisterPushTokenAsync(uid);
  }
  await callCallableFunction('deleteAccount', {});
  if (process.env.EXPO_PUBLIC_USE_EMULATOR !== 'true') {
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch {
      // non-fatal — Firebase sign-out still clears the session
    }
  }
  await firebaseSignOut(auth);
}

export async function initializeUserDocs(user: User): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return;

  await Promise.all([
    setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      photoURL: user.photoURL ?? null,
      createdAt: serverTimestamp(),
    }),
    setDoc(doc(db, 'userMemberships', user.uid), {
      uid: user.uid,
      clubIds: [],
    }),
  ]);
}
