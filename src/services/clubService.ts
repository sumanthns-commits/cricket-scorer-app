import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  serverTimestamp,
  arrayUnion,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Club, ClubMember, ClubRules, Match } from '../types';

const defaultRules: ClubRules = {
  ballsPerOver: 6,
  oversPerInnings: undefined,
  enabledDismissals: [
    'caught', 'bowled', 'lbw', 'run-out', 'stumped',
    'hit-wicket', 'obstructing-field', 'timed-out', 'handled-ball', 'hit-ball-twice',
  ],
  customDismissals: [],
  enabledExtras: ['wide', 'no-ball', 'bye', 'leg-bye'],
  roverThrowCap: undefined,
  lastManStands: false,
  compulsoryRetirementAt: undefined,
  maxBowlerOvers: undefined,
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

export async function getClub(clubId: string): Promise<Club | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId));
  return snap.exists() ? (snap.data() as Club) : null;
}

export async function getClubMember(clubId: string, uid: string): Promise<ClubMember | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'players', uid));
  return snap.exists() ? (snap.data() as ClubMember) : null;
}

export async function hasLiveMatch(clubId: string): Promise<boolean> {
  const q = query(
    collection(db, 'matches'),
    where('clubId', '==', clubId),
    where('status', '==', 'live'),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function saveClubRules(clubId: string, rules: ClubRules): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId), { rules });
}
