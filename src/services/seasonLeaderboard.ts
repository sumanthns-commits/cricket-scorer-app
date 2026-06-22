import type { FieldingPolarity, Match, OverDocument } from '../types';
import { getMatchOvers } from './matchService';
import { buildInningsCard } from './scorecard';

// Rating points per non-dismissal fielding event by polarity. Kept in sync with
// the backend POLARITY_POINTS in onMatchCompleted.ts (which bakes the same
// points into careerStats.fieldingPoints for the all-time skill rating).
const POLARITY_POINTS: Record<FieldingPolarity, number> = {
  positive: 3,
  negative: -3,
  neutral: 0,
};

export interface BattingLeader {
  playerId: string;
  innings: number;
  runs: number;
  balls: number;
  outs: number;
  fours: number;
  sixes: number;
  highScore: number;
  average: number | null; // null when never dismissed
  strikeRate: number;
}

export interface BowlingLeader {
  playerId: string;
  balls: number;
  runs: number;
  wickets: number;
  economy: number;
  average: number | null; // null when no wickets
  bestWickets: number;
  bestRuns: number; // runs conceded in the best-figures innings
}

export interface FieldingLeader {
  playerId: string;
  catches: number;
  stumpings: number;
  runOuts: number;
  // Net points from non-dismissal fielding events (good adds, bad subtracts).
  eventPoints: number;
  // Composite fielding score, same scale as the skill rating:
  // (catches + stumpings + runOuts) × 5 + eventPoints.
  score: number;
}

export interface SeasonLeaderboard {
  batting: BattingLeader[];
  bowling: BowlingLeader[];
  fielding: FieldingLeader[];
  matchesCounted: number;
}

interface BattingAcc {
  innings: number;
  runs: number;
  balls: number;
  outs: number;
  fours: number;
  sixes: number;
  highScore: number;
}

interface BowlingAcc {
  balls: number;
  runs: number;
  wickets: number;
  bestWickets: number;
  bestRuns: number;
}

interface FieldingAcc {
  catches: number;
  stumpings: number;
  runOuts: number;
  eventPoints: number;
}

// Credit fielders for the dismissals they effected and the non-dismissal
// fielding events credited to them. Each ball can credit at most one
// catch/stumping; run-outs credit every fielder named on the ball. Event
// points come from the match's own polarity config (label → points).
function tallyFielding(
  over: OverDocument,
  fielding: Map<string, FieldingAcc>,
  eventPoints: Map<string, number>,
  resolve: (id: string) => string,
): void {
  const acc = (id: string): FieldingAcc => {
    const key = resolve(id);
    let f = fielding.get(key);
    if (!f) {
      f = { catches: 0, stumpings: 0, runOuts: 0, eventPoints: 0 };
      fielding.set(key, f);
    }
    return f;
  };

  for (const ball of over.balls) {
    const d = ball.dismissal;
    if (d) {
      if (d.type === 'caught') {
        const ids = d.fielderIds ?? (d.fielderId ? [d.fielderId] : []);
        for (const id of ids) acc(id).catches++;
      } else if (d.type === 'stumped') {
        const ids = d.fielderIds ?? (d.fielderId ? [d.fielderId] : []);
        for (const id of ids) acc(id).stumpings++;
      } else if (d.type === 'run-out') {
        const ids = d.fielderIds ?? (d.fielderId ? [d.fielderId] : []);
        for (const id of ids) acc(id).runOuts++;
      }
    }

    const fe = ball.fielding;
    if (fe?.eventLabel) {
      const pts = eventPoints.get(fe.eventLabel) ?? 0;
      const ids = fe.fielderIds ?? (fe.fielderId ? [fe.fielderId] : []);
      for (const id of ids) acc(id).eventPoints += pts;
    }
  }
}

/**
 * Aggregate a per-season leaderboard from the season's matches. Only
 * completed/abandoned matches carry meaningful scorecards; scheduled and live
 * matches are skipped so partial innings don't distort averages.
 *
 * Stats are derived ball-by-ball from each match's overs (career totals are
 * all-time and can't be sliced by season), reusing buildInningsCard per innings
 * so high scores and best bowling figures stay per-innings.
 */
export async function buildSeasonLeaderboard(
  clubId: string,
  matches: Match[],
  ghostToMember: Record<string, string> = {},
): Promise<SeasonLeaderboard> {
  const played = matches.filter(
    (m) => m.status === 'completed' || m.status === 'abandoned',
  );

  const batting = new Map<string, BattingAcc>();
  const bowling = new Map<string, BowlingAcc>();
  const fielding = new Map<string, FieldingAcc>();

  // Remap a linked ghost's ID to its member's ID so historical imported stats
  // are credited to the member rather than the now-hidden ghost.
  const resolve = (id: string) => ghostToMember[id] ?? id;

  const batAcc = (id: string): BattingAcc => {
    let b = batting.get(id);
    if (!b) {
      b = { innings: 0, runs: 0, balls: 0, outs: 0, fours: 0, sixes: 0, highScore: 0 };
      batting.set(id, b);
    }
    return b;
  };
  const bowlAcc = (id: string): BowlingAcc => {
    let b = bowling.get(id);
    if (!b) {
      b = { balls: 0, runs: 0, wickets: 0, bestWickets: 0, bestRuns: 0 };
      bowling.set(id, b);
    }
    return b;
  };

  const overSets = await Promise.all(
    played.map((m) => getMatchOvers(clubId, m.id).catch(() => [] as OverDocument[])),
  );

  let matchesCounted = 0;

  played.forEach((match, i) => {
    const overs = overSets[i];

    if (overs.length === 0) {
      // Imported match: no ball-by-ball overs, fall back to inningsSummary.
      const summary = match.inningsSummary;
      if (!summary || Object.keys(summary).length === 0) return;
      matchesCounted++;

      for (const inn of Object.values(summary)) {
        for (const bat of inn.batting) {
          const a = batAcc(resolve(bat.id));
          a.innings++;
          a.runs += bat.runs;
          a.balls += bat.balls;
          a.fours += bat.fours;
          a.sixes += bat.sixes;
          if (bat.out) a.outs++;
          if (bat.runs > a.highScore) a.highScore = bat.runs;
        }
        for (const bowl of inn.bowling) {
          const a = bowlAcc(resolve(bowl.id));
          a.balls += bowl.balls;
          a.runs += bowl.runs;
          a.wickets += bowl.wickets;
          if (
            bowl.wickets > a.bestWickets ||
            (bowl.wickets === a.bestWickets && bowl.runs < a.bestRuns)
          ) {
            a.bestWickets = bowl.wickets;
            a.bestRuns = bowl.runs;
          }
        }
      }
      return;
    }

    matchesCounted++;
    const ballsPerOver = match.rules.ballsPerOver ?? 6;

    const inningsIds = [...new Set(overs.map((o) => o.inningsId))];
    for (const inningsId of inningsIds) {
      const inningsOvers = overs.filter((o) => o.inningsId === inningsId);
      const card = buildInningsCard(inningsOvers, ballsPerOver);

      for (const bat of card.batting) {
        const a = batAcc(resolve(bat.id));
        a.innings++;
        a.runs += bat.runs;
        a.balls += bat.balls;
        a.fours += bat.fours;
        a.sixes += bat.sixes;
        if (bat.out) a.outs++;
        if (bat.runs > a.highScore) a.highScore = bat.runs;
      }

      for (const bowl of card.bowling) {
        const a = bowlAcc(resolve(bowl.id));
        a.balls += bowl.balls;
        a.runs += bowl.runs;
        a.wickets += bowl.wickets;
        // Best figures: most wickets, then fewest runs conceded.
        if (
          bowl.wickets > a.bestWickets ||
          (bowl.wickets === a.bestWickets && bowl.runs < a.bestRuns)
        ) {
          a.bestWickets = bowl.wickets;
          a.bestRuns = bowl.runs;
        }
      }
    }

    // Polarity → points for this match's fielding events, keyed by label (the
    // same key stored on each ball's fielding metadata).
    const eventPoints = new Map<string, number>();
    for (const ev of match.rules.fieldingEvents ?? []) {
      eventPoints.set(ev.label, POLARITY_POINTS[ev.polarity ?? 'neutral']);
    }
    for (const over of overs) tallyFielding(over, fielding, eventPoints, resolve);
  });

  const battingLeaders: BattingLeader[] = [...batting.entries()].map(([playerId, a]) => ({
    playerId,
    innings: a.innings,
    runs: a.runs,
    balls: a.balls,
    outs: a.outs,
    fours: a.fours,
    sixes: a.sixes,
    highScore: a.highScore,
    average: a.outs > 0 ? a.runs / a.outs : null,
    strikeRate: a.balls > 0 ? (a.runs / a.balls) * 100 : 0,
  }));

  const bowlingLeaders: BowlingLeader[] = [...bowling.entries()].map(([playerId, a]) => ({
    playerId,
    balls: a.balls,
    runs: a.runs,
    wickets: a.wickets,
    economy: a.balls > 0 ? a.runs / (a.balls / 6) : 0,
    average: a.wickets > 0 ? a.runs / a.wickets : null,
    bestWickets: a.bestWickets,
    bestRuns: a.bestRuns,
  }));

  const fieldingLeaders: FieldingLeader[] = [...fielding.entries()].map(([playerId, a]) => ({
    playerId,
    catches: a.catches,
    stumpings: a.stumpings,
    runOuts: a.runOuts,
    eventPoints: a.eventPoints,
    score: (a.catches + a.stumpings + a.runOuts) * 5 + a.eventPoints,
  }));

  // Rank: runs > batting; wickets (then economy) > bowling; net fielding score
  // (then dismissals) > fielding.
  battingLeaders.sort((x, y) => y.runs - x.runs || y.highScore - x.highScore);
  bowlingLeaders.sort(
    (x, y) => y.wickets - x.wickets || x.economy - y.economy,
  );
  fieldingLeaders.sort(
    (x, y) =>
      y.score - x.score ||
      y.catches + y.stumpings + y.runOuts - (x.catches + x.stumpings + x.runOuts),
  );

  return {
    batting: battingLeaders,
    bowling: bowlingLeaders,
    // Include anyone with a dismissal or any non-zero fielding-event score.
    fielding: fieldingLeaders.filter(
      (f) => f.catches + f.stumpings + f.runOuts > 0 || f.eventPoints !== 0,
    ),
    matchesCounted,
  };
}
