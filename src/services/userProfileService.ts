import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
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
  wicketKeeping?: WicketKeepingAbility | null;
  bio?: string;
  matchNotifications?: boolean;
};

export async function updateUserProfile(
  uid: string,
  edits: UserProfileEdits
): Promise<void> {
  const { matchNotifications, ...rest } = edits;
  const update: Record<string, unknown> = { ...rest };
  if (edits.wicketKeeping === null) update.wicketKeeping = deleteField();
  // Dotted field path, not a replacement `{ notificationPrefs: {...} }`
  // object — a plain nested-object write would blow away any future
  // sibling preference under notificationPrefs.
  if (matchNotifications !== undefined) {
    update['notificationPrefs.matchNotifications'] = matchNotifications;
  }
  await updateDoc(doc(db, 'users', uid), update);
}
