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
import type { Club, ClubMember, ClubRules, Match, CareerStats, PlayerType } from '../types';

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

const emptyStats: CareerStats = {
  totalRuns: 0,
  totalWickets: 0,
  totalBallsFaced: 0,
  totalDismissals: 0,
  totalBallsBowled: 0,
  totalRunsConceded: 0,
  totalCatches: 0,
  totalRunOuts: 0,
  highScore: 0,
  matchesPlayed: 0,
};

export async function createClub(
  uid: string,
  name: string,
  description: string,
  creator: { displayName: string; email?: string; photoURL?: string }
): Promise<string> {
  const clubRef = doc(collection(db, 'clubs'));
  const clubId = clubRef.id;

  // Create the club doc first: the players-create security rule reads
  // club.createdBy to authorise the creator's own (admin) player doc.
  await setDoc(clubRef, {
    id: clubId,
    name,
    description,
    rules: defaultRules,
    createdAt: serverTimestamp(),
    createdBy: uid,
  });

  await Promise.all([
    setDoc(doc(db, 'clubs', clubId, 'players', uid), {
      id: uid,
      clubId,
      playerId: uid,
      role: 'admin',
      joinedAt: serverTimestamp(),
      displayName: creator.displayName,
      email: creator.email,
      photoURL: creator.photoURL,
      type: 'registered' as PlayerType,
      activeClaim: null,
      careerStats: emptyStats,
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
