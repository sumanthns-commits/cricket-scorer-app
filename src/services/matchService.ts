import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { BallEntry, ClubRules, Match, MatchFormat, MatchToss, OverDocument, Player, PlayerType, CareerStats } from '../types';

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

export async function getClubPlayers(clubId: string): Promise<Player[]> {
  const snap = await getDocs(collection(db, 'clubs', clubId, 'players'));
  const results: Player[] = [];

  for (const d of snap.docs) {
    const data = d.data();
    // Linked ghosts have been absorbed into a registered member; exclude them
    // from team selection so the same person can't be picked twice.
    if (data.type === 'linked') continue;
    if (data.displayName) {
      results.push({ id: d.id, ...data } as Player);
    } else {
      // Registered user added as member — try to get display name from /users/{id}
      const userSnap = await getDoc(doc(db, 'users', d.id));
      const userData = userSnap.exists() ? userSnap.data() : null;
      results.push({
        id: d.id,
        displayName: userData?.displayName ?? d.id,
        type: (data.type as PlayerType) ?? 'registered',
        activeClaim: data.activeClaim ?? null,
        careerStats: (data.careerStats as CareerStats) ?? emptyStats,
      });
    }
  }

  return results;
}

export async function createMatch(params: {
  clubId: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  date: Date;
  format: MatchFormat;
  rules: ClubRules;
  squad: string[];
  teamA?: string[];
  teamB?: string[];
}): Promise<string> {
  const matchRef = doc(collection(db, 'clubs', params.clubId, 'matches'));
  const matchId = matchRef.id;
  await setDoc(matchRef, {
    id: matchId,
    clubId: params.clubId,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    venue: params.venue,
    date: Timestamp.fromDate(params.date),
    format: params.format,
    status: 'scheduled',
    rules: params.rules,
    squad: params.squad,
    teamA: params.teamA ?? [],
    teamB: params.teamB ?? [],
  });
  return matchId;
}

export async function getMatch(clubId: string, matchId: string): Promise<Match | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'matches', matchId));
  return snap.exists() ? (snap.data() as Match) : null;
}

export async function getClubMatches(clubId: string): Promise<Match[]> {
  const snap = await getDocs(collection(db, 'clubs', clubId, 'matches'));
  return snap.docs.map((d) => d.data() as Match);
}

export async function setMatchTeams(params: {
  clubId: string;
  matchId: string;
  teamA: string[];
  teamB: string[];
  captainA?: string;
  captainB?: string;
}): Promise<void> {
  const { clubId, matchId, teamA, teamB, captainA, captainB } = params;
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    teamA,
    teamB,
    captainA: captainA ?? null,
    captainB: captainB ?? null,
  });
}

export async function setMatchToss(
  clubId: string,
  matchId: string,
  toss: MatchToss
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    toss,
    status: 'live',
  });
}

export async function completeMatch(
  clubId: string,
  matchId: string,
  result?: string
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    status: 'completed',
    result: result ?? null,
    completedAt: Timestamp.now(),
  });
}

// Adjust the overs-per-innings limit mid-match (1st innings only — see
// LiveScoring). The caller guarantees the new value isn't below overs already
// bowled, so completed overs are never discarded.
export async function updateMatchOvers(
  clubId: string,
  matchId: string,
  oversPerInnings: number,
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    'rules.oversPerInnings': oversPerInnings,
  });
}

export async function abandonMatch(clubId: string, matchId: string): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    status: 'abandoned',
    result: 'Match abandoned',
    completedAt: Timestamp.now(),
  });
}

// Only valid before the first ball — there are no overs to orphan yet.
export async function deleteMatch(clubId: string, matchId: string): Promise<void> {
  await deleteDoc(doc(db, 'clubs', clubId, 'matches', matchId));
}

export async function getMatchOvers(
  clubId: string,
  matchId: string,
): Promise<OverDocument[]> {
  const snap = await getDocs(
    collection(db, 'clubs', clubId, 'matches', matchId, 'overs'),
  );
  return snap.docs.map((d) => d.data() as OverDocument);
}

export async function saveOver(params: {
  clubId: string;
  matchId: string;
  inningsId: string;
  overNumber: number;
  bowlerId: string;
  balls: BallEntry[];
  isComplete: boolean;
}): Promise<void> {
  const { clubId, matchId, inningsId, overNumber, bowlerId, balls, isComplete } = params;
  const overKey = `${inningsId}_${overNumber}`;
  await setDoc(
    doc(db, 'clubs', clubId, 'matches', matchId, 'overs', overKey),
    { id: overKey, matchId, inningsId, overNumber, bowlerId, balls, isComplete },
  );
}
