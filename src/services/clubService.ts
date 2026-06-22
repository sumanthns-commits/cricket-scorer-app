import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  startAt,
  endAt,
  serverTimestamp,
  arrayUnion,
  updateDoc,
  runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeClubName } from '../utils/clubName';
import type { Club, ClubMember, ClubRules, Match, CareerStats, PlayerType } from '../types';

// Thrown by createClub when another club already reserves the same (normalised)
// name. Callers surface this distinctly from generic failures.
export class ClubNameTakenError extends Error {
  constructor(clubName: string) {
    super(`A club named "${clubName}" already exists.`);
    this.name = 'ClubNameTakenError';
  }
}

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
  autoRotateStrikeEoO: true,
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
  totalStumpings: 0,
  highScore: 0,
  matchesPlayed: 0,
};

export async function createClub(
  uid: string,
  name: string,
  description: string,
  creator: { displayName: string; email?: string; photoURL?: string },
  hemisphere: 'N' | 'S'
): Promise<string> {
  const clubRef = doc(collection(db, 'clubs'));
  const clubId = clubRef.id;
  const normalized = normalizeClubName(name);
  const nameRef = doc(db, 'clubNames', normalized);

  // Reserve the (normalised) name and create the club atomically, so two people
  // can't claim the same name in a race. The reservation is released only when
  // the club is permanently deleted (see the archive cleanup Cloud Function).
  // The club doc is created here too — the players-create security rule reads
  // club.createdBy to authorise the creator's own (admin) player doc below.
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(nameRef);
    if (existing.exists()) throw new ClubNameTakenError(name);
    tx.set(clubRef, {
      id: clubId,
      name,
      description,
      rules: defaultRules,
      createdAt: serverTimestamp(),
      createdBy: uid,
      hemisphere,
      archivedAt: null,
    });
    tx.set(nameRef, { clubId, name, normalized, createdBy: uid });
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
    .map((snap) => ({ id: snap.id, ...snap.data() } as Club));
}

export interface ClubWithRole {
  club: Club;
  isAdmin: boolean;
}

export async function getUserClubsWithRoles(uid: string): Promise<ClubWithRole[]> {
  const membershipSnap = await getDoc(doc(db, 'userMemberships', uid));
  if (!membershipSnap.exists()) return [];

  const clubIds = (membershipSnap.data().clubIds as string[]) ?? [];
  if (clubIds.length === 0) return [];

  const [clubSnaps, memberSnaps] = await Promise.all([
    Promise.all(clubIds.map((id) => getDoc(doc(db, 'clubs', id)))),
    Promise.all(clubIds.map((id) => getDoc(doc(db, 'clubs', id, 'players', uid)))),
  ]);

  return clubSnaps
    .map((snap, i) => ({ snap, memberSnap: memberSnaps[i] }))
    .filter(({ snap }) => snap.exists())
    .map(({ snap, memberSnap }) => ({
      club: { id: snap.id, ...snap.data() } as Club,
      isAdmin: (memberSnap.data() as ClubMember | undefined)?.role === 'admin',
    }));
}

export interface ClubSearchResult {
  clubId: string;
  name: string;
}

// Discovery search for clubs by name. Runs against the signed-in-readable
// `clubNames` registry (the `clubs` collection itself is member-private), using
// a normalised-prefix range query so "st m" matches "St Mary's CC". Returns at
// most 20 matches; empty/blank input returns [].
//
// Archived clubs are excluded: archiving a club keeps its name reservation (the
// entry isn't freed until permanent deletion), so the registry's `archived`
// flag — maintained server-side by syncClubNameArchived — is the only way to
// hide them from search. Entries predating that flag have it absent, treated as
// not-archived.
export async function searchClubsByName(prefix: string): Promise<ClubSearchResult[]> {
  const normalized = normalizeClubName(prefix);
  if (!normalized) return [];

  const q = query(
    collection(db, 'clubNames'),
    orderBy('normalized'),
    startAt(normalized),
    endAt(normalized + ''),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as { clubId: string; name: string; archived?: boolean })
    .filter((data) => data.archived !== true)
    .map((data) => ({ clubId: data.clubId, name: data.name }));
}

export async function getClub(clubId: string): Promise<Club | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId));
  return snap.exists() ? (snap.data() as Club) : null;
}

export async function getClubMember(clubId: string, uid: string): Promise<ClubMember | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'players', uid));
  return snap.exists() ? (snap.data() as ClubMember) : null;
}

export async function getRegisteredClubMembers(clubId: string): Promise<{ id: string; displayName: string }[]> {
  const snap = await getDocs(
    query(collection(db, 'clubs', clubId, 'players'), where('type', '==', 'registered'))
  );
  return snap.docs.map(d => ({ id: d.id, displayName: d.data().displayName ?? '' }));
}

export async function hasLiveMatch(clubId: string): Promise<boolean> {
  // Matches are a subcollection of the club (clubs/{clubId}/matches). Querying a
  // top-level `matches` collection both misses the data and hits a deny rule.
  const q = query(
    collection(db, 'clubs', clubId, 'matches'),
    where('status', '==', 'live'),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function saveClubRules(clubId: string, rules: ClubRules): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId), { rules });
}

// Admin-only at the security layer (clubs `allow update: if isAdmin`). The
// screen also gates the UI to admins; this just writes the editable fields.
export async function updateClubDetails(
  clubId: string,
  details: { name: string; description: string; hemisphere: 'N' | 'S' }
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId), details);
}

// Archiving is reversible: it only stamps archivedAt. A scheduled Cloud Function
// permanently deletes the club (and all matches) 30 days later. Admin-only at
// the security layer (clubs `allow update: if isAdmin`).
export async function archiveClub(clubId: string): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId), { archivedAt: serverTimestamp() });
}

export async function unarchiveClub(clubId: string): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId), { archivedAt: null });
}

export async function setMemberRole(
  clubId: string,
  playerId: string,
  role: 'admin' | 'member'
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'players', playerId), { role });
}
