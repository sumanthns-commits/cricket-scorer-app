import type { BallDoc, BallEntry, CustomDismissal, DismissalEntry, Match, Player } from '../types';
import { emptyExtras, type ExtrasBreakdown } from '../utils/extras';

// Live/replay-able snapshot of one innings' crease state and per-player
// stats. Built by buildInningsFromBalls from the raw ball sequence — shared
// by LiveScoring (the scorer's editable view) and MatchScorecard (the
// spectator's read-only live view) so the two never diverge on how a crease
// position or figure is derived from the same balls/{} data.

export interface BatterStats {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissalText?: string;
}

export interface BowlerStats {
  legalBalls: number;
  completedOvers: number;
  runsConceded: number;
  wickets: number;
  // Wide/no-ball runs conceded by this bowler (already included in
  // runsConceded — byes/leg-byes are never charged to the bowler).
  extras: number;
}

export interface InningsState {
  inningsId: string;
  battingIds: string[];
  bowlingIds: string[];
  totalRuns: number;
  totalWickets: number;
  extras: ExtrasBreakdown;
  overNumber: number;
  legalBallsInOver: number;
  onStrikeId: string;
  offStrikeId: string;
  bowlerId: string;
  batterStats: Record<string, BatterStats>;
  bowlerStats: Record<string, BowlerStats>;
  currentOverBalls: BallEntry[];
  // Last 3 balls of the over immediately before overNumber — shown ahead of
  // currentOverBalls so the ball strip doesn't go blank the instant a new
  // over starts. Empty for the innings' first over.
  previousOverBalls: BallEntry[];
  handedness: Record<string, 'RHB' | 'LHB'>;
}

export function emptyBatterStats(): BatterStats {
  return { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false };
}

export function emptyBowlerStats(): BowlerStats {
  return { legalBalls: 0, completedOvers: 0, runsConceded: 0, wickets: 0, extras: 0 };
}

export function buildDismissalText(
  d: DismissalEntry,
  getName: (id: string) => string,
  customDismissals: CustomDismissal[] = [],
): string {
  const bowler = d.bowlerId ? getName(d.bowlerId) : '';
  const fielderIds = d.fielderIds ?? (d.fielderId ? [d.fielderId] : []);
  const fielder = fielderIds.map(getName).join(' & ');
  const custom = customDismissals.find((cd) => cd.id === d.type);
  if (custom) return custom.bowlerGetsWicket && bowler ? `${custom.label} - b ${bowler}` : custom.label;
  switch (d.type) {
    case 'bowled': return `b ${bowler}`;
    case 'lbw': return `lbw b ${bowler}`;
    case 'caught': return fielder ? `c ${fielder} b ${bowler}` : `c & b ${bowler}`;
    case 'stumped': return `st ${fielder} b ${bowler}`;
    case 'run-out': return fielder ? `run out (${fielder})` : 'run out';
    case 'hit-wicket': return `hit wkt b ${bowler}`;
    case 'obstructing-field': return 'obstructing field';
    case 'timed-out': return 'timed out';
    default: return d.type;
  }
}

// Computes who should face the next delivery after a given ball.
export function computeNextBatsmen(
  ball: BallDoc,
  autoRotateEoO: boolean,
  isLoneBatter: boolean,
): { onStrikeId: string; offStrikeId: string } {
  const physRuns = (ball.extras?.type === 'wide' || ball.extras?.type === 'no-ball')
    ? ball.runs + (ball.extras?.runs ?? 0) - 1
    : ball.runs;

  if (ball.dismissal && !isLoneBatter) {
    const isNonStrikerOut = ball.dismissal.nonStrikerOut;
    // Run-outs: must mirror commitBall's crossedOnRunOut exactly — always
    // assume the batsmen crossed on the run that got them out, so an even
    // completedRuns count (including 0) means crossed, odd means not. Other
    // dismissal types never involve crossing (and never carry nonzero runs).
    const crossedOnRunOut = ball.dismissal.type === 'run-out'
      ? physRuns % 2 === 0
      : physRuns % 2 !== 0;
    const eooSwap = ball.isLastBallOfOver && autoRotateEoO;
    const survivorIsOnStrike = (isNonStrikerOut !== crossedOnRunOut) !== eooSwap;
    const survivorId = isNonStrikerOut ? ball.batsmanId : ball.nonStrikerId;
    const replacementId = ball.dismissal.nextBatsmanId ?? '';
    return survivorIsOnStrike
      ? { onStrikeId: survivorId, offStrikeId: replacementId }
      : { onStrikeId: replacementId, offStrikeId: survivorId };
  }

  let onStrike = ball.batsmanId;
  let offStrike = ball.nonStrikerId;
  if (!isLoneBatter) {
    const runRotate = physRuns % 2 !== 0;
    const eooRotate = ball.isLastBallOfOver && autoRotateEoO;
    if (runRotate !== eooRotate) [onStrike, offStrike] = [offStrike, onStrike];
  }
  return { onStrikeId: onStrike, offStrikeId: offStrike };
}

export function firstInningsBatters(m: Match): string[] {
  if (!m.toss) return m.teamA ?? [];
  const tossWinnerBats =
    (m.toss.winnerId === 'homeTeam' && m.toss.choice === 'bat') ||
    (m.toss.winnerId === 'awayTeam' && m.toss.choice === 'field');
  return tossWinnerBats ? (m.teamA ?? []) : (m.teamB ?? []);
}

export function firstInningsBowlers(m: Match): string[] {
  if (!m.toss) return m.teamB ?? [];
  const tossWinnerBats =
    (m.toss.winnerId === 'homeTeam' && m.toss.choice === 'bat') ||
    (m.toss.winnerId === 'awayTeam' && m.toss.choice === 'field');
  return tossWinnerBats ? (m.teamB ?? []) : (m.teamA ?? []);
}

// Teams swap for the 2nd innings: who bowled first now bats, and vice versa.
export function battingForInnings(m: Match, n: number): string[] {
  return n === 1 ? firstInningsBatters(m) : firstInningsBowlers(m);
}
export function bowlingForInnings(m: Match, n: number): string[] {
  return n === 1 ? firstInningsBowlers(m) : firstInningsBatters(m);
}

// Builds InningsState from BallDocs.
// Stats are replayed from ball documents; crease state is computed from the last ball.
export function buildInningsFromBalls(
  balls: BallDoc[],
  m: Match,
  n: number,
  localPlayers: Player[] = [],
  autoRotateEoO: boolean,
): InningsState {
  const battingIds = battingForInnings(m, n);
  const bowlingIds = bowlingForInnings(m, n);
  const localNameMap = Object.fromEntries(localPlayers.map((p) => [p.id, p.displayName]));

  const batterStats: Record<string, BatterStats> = {};
  const bowlerStats: Record<string, BowlerStats> = {};
  const bowlerCompletedOvers = new Map<string, Set<number>>();
  const extras = emptyExtras();

  for (const ball of balls) {
    // Runs and balls credited to the on-striker (batsmanId)
    if (!batterStats[ball.batsmanId]) batterStats[ball.batsmanId] = emptyBatterStats();
    const bat = batterStats[ball.batsmanId];
    const isLegal = ball.extras?.type !== 'wide' && ball.extras?.type !== 'no-ball';
    bat.runs += ball.runs;
    if (isLegal) bat.balls++;
    if (ball.runs === 4 && !ball.extras) bat.fours++;
    if (ball.runs === 6 && !ball.extras) bat.sixes++;

    // Dismissal attributed to outBatsmanId (on-striker or non-striker)
    if (ball.dismissal) {
      const outId = ball.dismissal.outBatsmanId;
      if (!batterStats[outId]) batterStats[outId] = emptyBatterStats();
      const dismissedBat = batterStats[outId];
      dismissedBat.isOut = true;
      const getName = (id: string) => localNameMap[id] ?? id;
      dismissedBat.dismissalText = buildDismissalText(
        { type: ball.dismissal.type, fielderIds: ball.dismissal.fielderIds, bowlerId: ball.bowlerId },
        getName,
        m.rules.customDismissals,
      );
    }

    // Bowler stats
    if (!bowlerStats[ball.bowlerId]) bowlerStats[ball.bowlerId] = emptyBowlerStats();
    const bow = bowlerStats[ball.bowlerId];
    const extrasType = ball.extras?.type;
    const byeLB = (extrasType === 'bye' || extrasType === 'leg-bye') ? (ball.extras?.runs ?? 0) : 0;
    const isWideNoBall = extrasType === 'wide' || extrasType === 'no-ball';
    switch (extrasType) {
      case 'wide': extras.wides += ball.extras?.runs ?? 0; break;
      case 'no-ball': extras.noBalls += ball.extras?.runs ?? 0; break;
      case 'bye': extras.byes += ball.extras?.runs ?? 0; break;
      case 'leg-bye': extras.legByes += ball.extras?.runs ?? 0; break;
    }
    bow.runsConceded += ball.runs + (isWideNoBall ? (ball.extras?.runs ?? 0) : 0) - byeLB;
    if (isWideNoBall) bow.extras += ball.extras?.runs ?? 0;
    if (isLegal) bow.legalBalls++;
    if (ball.dismissal) bow.wickets++;
    if (ball.isLastBallOfOver) {
      if (!bowlerCompletedOvers.has(ball.bowlerId)) bowlerCompletedOvers.set(ball.bowlerId, new Set());
      bowlerCompletedOvers.get(ball.bowlerId)!.add(ball.overNumber);
    }
  }

  for (const [bowlerId, overs] of bowlerCompletedOvers) {
    if (!bowlerStats[bowlerId]) bowlerStats[bowlerId] = emptyBowlerStats();
    bowlerStats[bowlerId].completedOvers = overs.size;
  }

  const lastBall = balls[balls.length - 1];

  // Compute crease state from the last ball using rotation logic
  const lastOverNumber = lastBall?.overNumber ?? 0;
  const activeOverNumber = lastBall?.isLastBallOfOver ? lastOverNumber + 1 : lastOverNumber;

  // Count legal balls in the current (active) over
  const legalBallsInCurrentOver = balls.filter(
    (b) => b.overNumber === activeOverNumber && b.extras?.type !== 'wide' && b.extras?.type !== 'no-ball',
  ).length;

  // Derive on-striker and non-striker after the last ball
  let onStrikeId = '';
  let offStrikeId = '';
  let currentBowlerId = '';

  if (lastBall) {
    const isLoneBatter = lastBall.nonStrikerId === '';
    const next = computeNextBatsmen(lastBall, autoRotateEoO, isLoneBatter);
    onStrikeId = next.onStrikeId;
    offStrikeId = next.offStrikeId;
    currentBowlerId = lastBall.isLastBallOfOver ? '' : lastBall.bowlerId;
  }

  // Seed empty stats for current crease pair
  if (onStrikeId && !batterStats[onStrikeId]) batterStats[onStrikeId] = emptyBatterStats();
  if (offStrikeId && !batterStats[offStrikeId]) batterStats[offStrikeId] = emptyBatterStats();

  // Current over balls (for display in the scoring row)
  const toBallEntry = (b: BallDoc): BallEntry => ({
    batsmanId: b.dismissal?.nonStrikerOut ? b.nonStrikerId : b.batsmanId,
    runs: b.runs,
    extras: b.extras as BallEntry['extras'],
    dismissal: b.dismissal ? { type: b.dismissal.type, fielderIds: b.dismissal.fielderIds } : undefined,
    wagon: b.wagon,
    fielding: b.fielding,
    onStrikeId: b.dismissal?.nonStrikerOut ? b.batsmanId : undefined,
  });
  const currentOverBalls: BallEntry[] = balls
    .filter((b) => b.overNumber === activeOverNumber && !b.isLastBallOfOver)
    .map(toBallEntry);
  // Last 3 balls of the previous over, for continuity when the current
  // over is still empty (or short) right after a fresh over starts.
  const previousOverBalls: BallEntry[] = balls
    .filter((b) => b.overNumber === activeOverNumber - 1)
    .slice(-3)
    .map(toBallEntry);

  // Count total wickets = number of balls with dismissals
  const totalWickets = balls.filter((b) => !!b.dismissal).length;
  // Count total runs = sum of all runs + extras
  const totalRuns = balls.reduce((acc, b) => acc + b.runs + (b.extras?.runs ?? 0), 0);

  return {
    inningsId: `innings-${n}`,
    battingIds,
    bowlingIds,
    totalRuns,
    totalWickets,
    extras,
    overNumber: activeOverNumber,
    legalBallsInOver: legalBallsInCurrentOver,
    onStrikeId,
    offStrikeId,
    bowlerId: currentBowlerId,
    batterStats,
    bowlerStats,
    currentOverBalls,
    previousOverBalls,
    handedness: {},
  };
}
