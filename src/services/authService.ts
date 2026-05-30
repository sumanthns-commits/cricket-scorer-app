import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { db, auth } from './firebase';

export async function signInWithGoogleAccessToken(accessToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(null, accessToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function signOut(): Promise<void> {
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
