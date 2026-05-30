import {
  doc,
  setDoc,
  getDoc,
  collection,
  serverTimestamp,
  arrayUnion,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Club, ClubRules } from '../types';

const defaultRules: ClubRules = {
  customDismissals: [],
  fieldingEvents: [],
};

export async function createClub(
  uid: string,
  name: string,
  description: string
): Promise<string> {
  const clubRef = doc(collection(db, 'clubs'));
  const clubId = clubRef.id;

  await Promise.all([
    setDoc(clubRef, {
      id: clubId,
      name,
      description,
      rules: defaultRules,
      createdAt: serverTimestamp(),
      createdBy: uid,
    }),
    setDoc(doc(db, 'clubs', clubId, 'players', uid), {
      id: uid,
      clubId,
      playerId: uid,
      role: 'admin',
      joinedAt: serverTimestamp(),
    }),
    updateDoc(doc(db, 'userMemberships', uid), {
      clubIds: arrayUnion(clubId),
    }),
  ]);

  return clubId;
}

export async function getUserClubs(uid: string): Promise<Club[]> {
  const membershipSnap = await getDoc(doc(db, 'userMemberships', uid));
  if (!membershipSnap.exists()) return [];

  const clubIds = (membershipSnap.data().clubIds as string[]) ?? [];
  if (clubIds.length === 0) return [];

  const snapshots = await Promise.all(
    clubIds.map((id) => getDoc(doc(db, 'clubs', id)))
  );

  return snapshots
    .filter((snap) => snap.exists())
    .map((snap) => snap.data() as Club);
}
