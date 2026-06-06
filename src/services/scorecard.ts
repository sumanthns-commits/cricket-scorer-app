import type { OverDocument } from '../types';

export interface BatterCard {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
}

export interface BowlerCard {
  id: string;
  balls: number;
  runs: number;
  wickets: number;
}

export interface InningsCard {
  batting: BatterCard[];
  bowling: BowlerCard[];
  totalRuns: number;
  totalWickets: number;
  overs: string;
}

// Dismissal types that credit the bowler (the rest are run-outs etc.).
const BOWLER_CREDIT = new Set(['bowled', 'caught', 'lbw', 'stumped', 'hit-wicket']);

/** Aggregate a read-only scorecard for one innings from its over documents. */
export function buildInningsCard(overs: OverDocument[], ballsPerOver: number): InningsCard {
  const sorted = [...overs].sort((a, b) => a.overNumber - b.overNumber);

  const batters = new Map<string, BatterCard>();
  const order: string[] = [];
  const bowlers = new Map<string, BowlerCard>();
  let totalRuns = 0;
  let totalWickets = 0;
  let legalBalls = 0;

  const batterOf = (id: string): BatterCard => {
    let b = batters.get(id);
    if (!b) {
      b = { id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
      batters.set(id, b);
      order.push(id);
    }
    return b;
  };
  const bowlerOf = (id: string): BowlerCard => {
    let b = bowlers.get(id);
    if (!b) {
      b = { id, balls: 0, runs: 0, wickets: 0 };
      bowlers.set(id, b);
    }
    return b;
  };

  for (const over of sorted) {
    const bowler = bowlerOf(over.bowlerId);
    for (const ball of over.balls) {
      const isWideOrNoBall = ball.extras?.type === 'wide' || ball.extras?.type === 'no-ball';
      const isLegal = !isWideOrNoBall;
      const extraRuns = ball.extras?.runs ?? 0;
      const ballTotal = ball.runs + extraRuns;

      totalRuns += ballTotal;
      if (isLegal) legalBalls++;

      const bat = batterOf(ball.batsmanId);
      bat.runs += ball.runs; // runs off the bat only
      if (isLegal) bat.balls++;
      if (ball.runs === 4 && !ball.extras) bat.fours++;
      if (ball.runs === 6 && !ball.extras) bat.sixes++;

      // Bowler concedes runs off the bat + wides/no-balls (not byes/leg-byes).
      bowler.runs += ball.runs + (isWideOrNoBall ? extraRuns : 0);
      if (isLegal) bowler.balls++;

      if (ball.dismissal) {
        totalWickets++;
        bat.out = true;
        if (BOWLER_CREDIT.has(ball.dismissal.type)) bowler.wickets++;
      }
    }
  }

  const oversStr = `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
  return {
    batting: order.map((id) => batters.get(id) as BatterCard),
    bowling: [...bowlers.values()],
    totalRuns,
    totalWickets,
    overs: oversStr,
  };
}
