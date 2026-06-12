import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { AppUser, BattingHand, BowlingStyle, WicketKeepingAbility } from '../types';

// The global player profile lives on users/{uid} (signed-in-readable,
// self-writable). It travels with the player across every club and is what a
// club admin sees when reviewing their join request.
export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as AppUser) : null;
}

export type UserProfileEdits = {
  displayName?: string;
  battingHand?: BattingHand;
  bowlingStyle?: BowlingStyle;
  wicketKeeping?: WicketKeepingAbility;
  bio?: string;
};

export async function updateUserProfile(
  uid: string,
  edits: UserProfileEdits
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), edits);
}
