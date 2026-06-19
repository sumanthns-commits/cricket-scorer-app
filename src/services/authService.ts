import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { db, auth } from './firebase';

export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
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
