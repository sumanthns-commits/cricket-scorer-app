import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  where,
  orderBy,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import type { BallDoc, BallEntry, ClubRules, Match, MatchFormat, MatchToss, OverDocument, Player, PlayerType, CareerStats } from '../types';

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
        ...data,
        id: d.id,
        displayName: userData?.displayName ?? d.id,
        type: (data.type as PlayerType) ?? 'registered',
        activeClaim: data.activeClaim ?? null,
        careerStats: (data.careerStats as CareerStats) ?? emptyStats,
      } as Player);
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
  captainA?: string;
  captainB?: string;
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
    createdAt: Timestamp.now(),
    format: params.format,
    status: 'scheduled',
    rules: params.rules,
    squad: params.squad,
    teamA: params.teamA ?? [],
    teamB: params.teamB ?? [],
    ...(params.captainA ? { captainA: params.captainA } : {}),
    ...(params.captainB ? { captainB: params.captainB } : {}),
  });
  return matchId;
}

export async function getMatch(clubId: string, matchId: string): Promise<Match | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'matches', matchId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Match) : null;
}

export async function getClubMatches(clubId: string): Promise<Match[]> {
  const snap = await getDocs(collection(db, 'clubs', clubId, 'matches'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match);
}

export async function getClubMatchesBySeason(
  clubId: string,
  start: Date,
  end: Date,
): Promise<Match[]> {
  const q = query(
    collection(db, 'clubs', clubId, 'matches'),
    where('date', '>=', Timestamp.fromDate(start)),
    where('date', '<', Timestamp.fromDate(end)),
    orderBy('date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match);
}

export async function setMatchTeams(params: {
  clubId: string;
  matchId: string;
  teamA: string[];
  teamB: string[];
  captainA?: string;
  captainB?: string;
  homeTeam?: string;
  awayTeam?: string;
}): Promise<void> {
  const { clubId, matchId, teamA, teamB, captainA, captainB, homeTeam, awayTeam } = params;
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    teamA,
    teamB,
    captainA: captainA ?? null,
    captainB: captainB ?? null,
    ...(homeTeam !== undefined && { homeTeam }),
    ...(awayTeam !== undefined && { awayTeam }),
  });
}

export async function addSubstitute(clubId: string, matchId: string, playerId: string): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    substitutes: arrayUnion(playerId),
  });
}

export async function removeSubstitute(clubId: string, matchId: string, playerId: string): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    substitutes: arrayRemove(playerId),
  });
}

export async function setMatchToss(
  clubId: string,
  matchId: string,
  toss: MatchToss,
  scorer?: { scorerId: string; scorerName: string }
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    toss,
    status: 'live',
    ...(scorer && { scorerId: scorer.scorerId, scorerName: scorer.scorerName }),
  });
}

// Creates a match that is immediately live (used when deferring creation to the Toss step).
export async function createLiveMatch(params: {
  clubId: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  date: Date;
  format: MatchFormat;
  rules: ClubRules;
  squad: string[];
  teamA: string[];
  teamB: string[];
  captainA?: string;
  captainB?: string;
  toss: MatchToss;
  scorerId?: string;
  scorerName?: string;
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
    createdAt: Timestamp.now(),
    format: params.format,
    status: 'live',
    rules: params.rules,
    squad: params.squad,
    teamA: params.teamA,
    teamB: params.teamB,
    ...(params.captainA ? { captainA: params.captainA } : {}),
    ...(params.captainB ? { captainB: params.captainB } : {}),
    toss: params.toss,
    ...(params.scorerId ? { scorerId: params.scorerId, scorerName: params.scorerName } : {}),
  });
  return matchId;
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

// Persists the scorer's manual "End Innings" confirmation for the 1st innings.
// Match status stays 'live' (2nd innings hasn't started) — this flag is the
// only record that the scorer has sealed it, so a reload before the 2nd
// innings' first ball still knows not to offer undo again.
export async function endFirstInnings(clubId: string, matchId: string): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'matches', matchId), {
    firstInningsEnded: true,
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

// ── Per-ball document store ────────────────────────────────────────

// Returns a new DocumentReference with a client-generated ID.
// Callers store the ref.id in lastBallIdRef BEFORE calling setDoc so
// handleNewBatter can updateDoc the same doc without waiting for addDoc.
export function newBallRef(clubId: string, matchId: string) {
  return doc(collection(db, 'clubs', clubId, 'matches', matchId, 'balls'));
}

export async function saveBallDoc(
  ref: ReturnType<typeof doc>,
  ball: Omit<BallDoc, 'id'>,
): Promise<void> {
  await setDoc(ref, ball);
}

// Patches dismissal.nextBatsmanId onto the ball doc once the user selects
// a replacement after a wicket. The ball doc itself is the source of truth.
export async function updateBallNextBatsman(
  clubId: string,
  matchId: string,
  ballId: string,
  nextBatsmanId: string,
): Promise<void> {
  await updateDoc(
    doc(db, 'clubs', clubId, 'matches', matchId, 'balls', ballId),
    { 'dismissal.nextBatsmanId': nextBatsmanId },
  );
}

export async function getMatchBalls(
  clubId: string,
  matchId: string,
): Promise<BallDoc[]> {
  const snap = await getDocs(collection(db, 'clubs', clubId, 'matches', matchId, 'balls'));
  return snap.docs
    .map((d) => adaptToBallDoc(d.id, d.data()))
    .filter((b): b is BallDoc => b !== null)
    .sort((a, b) => a.seq - b.seq);
}

// Adapts either a new BallDoc or an old MatchEvent ball doc to BallDoc format.
// Returns null for non-ball event types (batsman-in, bowler-in).
function adaptToBallDoc(id: string, data: Record<string, unknown>): BallDoc | null {
  // Old non-ball event types — skip them
  if (data.type === 'batsman-in' || data.type === 'bowler-in') return null;

  // For old MatchEvent ball format: 'state' carries isOverComplete; new BallDoc has 'isLastBallOfOver'
  const oldState = data.state as Record<string, unknown> | undefined;
  const dismissal = data.dismissal as Record<string, unknown> | undefined;

  return {
    id,
    seq: data.seq as number,
    inningsId: data.inningsId as string,
    overNumber: data.overNumber as number,
    bowlerId: data.bowlerId as string,
    batsmanId: (data.batsmanId as string) ?? '',
    nonStrikerId: (data.nonStrikerId as string) ?? '',
    runs: (data.runs as number) ?? 0,
    extras: data.extras as BallDoc['extras'],
    wagon: data.wagon as BallDoc['wagon'],
    fielding: data.fielding as BallDoc['fielding'],
    dismissal: dismissal
      ? {
          type: dismissal.type as string,
          nonStrikerOut: (dismissal.nonStrikerOut as boolean) ?? false,
          outBatsmanId: (dismissal.outBatsmanId as string) ?? (data.batsmanId as string) ?? '',
          fielderIds: dismissal.fielderIds as string[] | undefined,
          nextBatsmanId: dismissal.nextBatsmanId as string | undefined,
        }
      : undefined,
    isLastBallOfOver:
      (data.isLastBallOfOver as boolean) ?? (oldState?.isOverComplete as boolean) ?? false,
  };
}

// Deletes the last ball document for the given innings.
export async function deleteLastBall(
  clubId: string,
  matchId: string,
  inningsId: string,
): Promise<BallDoc | undefined> {
  const all = await getMatchBalls(clubId, matchId);
  const forInnings = all.filter((b) => b.inningsId === inningsId);
  const last = forInnings[forInnings.length - 1];
  if (!last) return undefined;
  await deleteDoc(doc(db, 'clubs', clubId, 'matches', matchId, 'balls', last.id));
  const remaining = forInnings.slice(0, -1);
  return remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
}

// Converts BallDocs to synthetic OverDocuments so scorecard/stats consumers
// work unchanged for both old (overs) and new (balls) matches.
function ballDocsToOverDocs(balls: BallDoc[], matchId: string): OverDocument[] {
  const overMap = new Map<string, OverDocument>();
  for (const ball of balls) {
    const key = `${ball.inningsId}_${ball.overNumber}`;
    if (!overMap.has(key)) {
      overMap.set(key, {
        id: key,
        matchId,
        inningsId: ball.inningsId,
        overNumber: ball.overNumber,
        bowlerId: ball.bowlerId,
        balls: [],
        isComplete: false,
      });
    }
    const over = overMap.get(key)!;
    // For non-striker run-outs: set batsmanId to the dismissed player
    // so buildInningsCard correctly marks them as out.
    const entryBatsmanId = ball.dismissal?.nonStrikerOut ? ball.nonStrikerId : ball.batsmanId;
    const entry: BallEntry = {
      batsmanId: entryBatsmanId,
      runs: ball.runs,
      extras: ball.extras as BallEntry['extras'],
      dismissal: ball.dismissal
        ? {
            type: ball.dismissal.type,
            fielderIds: ball.dismissal.fielderIds,
          }
        : undefined,
      wagon: ball.wagon,
      fielding: ball.fielding,
      // Set onStrikeId for non-striker run-outs so runs credit goes to the actual facing batter.
      onStrikeId: ball.dismissal?.nonStrikerOut ? ball.batsmanId : undefined,
    };
    over.balls.push(entry);
    if (ball.isLastBallOfOver) over.isComplete = true;
  }
  return Array.from(overMap.values()).sort((a, b) => a.overNumber - b.overNumber);
}

// Returns OverDocuments for all consumers (scorecard, stats, leaderboard).
// Checks the new per-ball 'balls' collection first; falls back to legacy 'overs'.
export async function getMatchOvers(
  clubId: string,
  matchId: string,
): Promise<OverDocument[]> {
  const ballsSnap = await getDocs(collection(db, 'clubs', clubId, 'matches', matchId, 'balls'));
  if (!ballsSnap.empty) {
    const balls = ballsSnap.docs
      .map((d) => adaptToBallDoc(d.id, d.data() as Record<string, unknown>))
      .filter((b): b is BallDoc => b !== null)
      .sort((a, b) => a.seq - b.seq);
    if (balls.length > 0) return ballDocsToOverDocs(balls, matchId);
    // All docs were non-ball events (old format); fall through to overs/
  }
  const snap = await getDocs(collection(db, 'clubs', clubId, 'matches', matchId, 'overs'));
  return snap.docs.map((d) => d.data() as OverDocument);
}

export async function deleteOver(clubId: string, matchId: string, overId: string): Promise<void> {
  await deleteDoc(doc(db, 'clubs', clubId, 'matches', matchId, 'overs', overId));
}

export async function updateOverBatters(params: {
  clubId: string;
  matchId: string;
  inningsId: string;
  overNumber: number;
  onStrikeId: string;
  offStrikeId: string;
}): Promise<void> {
  const { clubId, matchId, inningsId, overNumber, onStrikeId, offStrikeId } = params;
  const overKey = `${inningsId}_${overNumber}`;
  await updateDoc(
    doc(db, 'clubs', clubId, 'matches', matchId, 'overs', overKey),
    { onStrikeId, offStrikeId },
  );
}

export async function saveOver(params: {
  clubId: string;
  matchId: string;
  inningsId: string;
  overNumber: number;
  bowlerId: string;
  balls: BallEntry[];
  isComplete: boolean;
  onStrikeId?: string;
  offStrikeId?: string;
}): Promise<void> {
  const { clubId, matchId, inningsId, overNumber, bowlerId, balls, isComplete, onStrikeId, offStrikeId } = params;
  const overKey = `${inningsId}_${overNumber}`;
  await setDoc(
    doc(db, 'clubs', clubId, 'matches', matchId, 'overs', overKey),
    { id: overKey, matchId, inningsId, overNumber, bowlerId, balls, isComplete, onStrikeId, offStrikeId },
  );
}
