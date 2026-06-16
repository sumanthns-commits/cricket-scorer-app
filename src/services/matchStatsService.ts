import type { OverDocument } from '../types';

export interface PerOverStat {
  overNumber: number; // 1-indexed for display
  runs: number;
  wickets: number;
}

/** Runs conceded + wickets fallen for each over of one innings, in bowling order. */
export function getPerOverStats(overs: OverDocument[]): PerOverStat[] {
  const sorted = [...overs].sort((a, b) => a.overNumber - b.overNumber);
  return sorted.map((over) => {
    let runs = 0;
    let wickets = 0;
    for (const ball of over.balls) {
      runs += ball.runs + (ball.extras?.runs ?? 0);
      if (ball.dismissal) wickets++;
    }
    return { overNumber: over.overNumber + 1, runs, wickets };
  });
}

export interface WormPoint {
  overNumber: number; // 0 = innings start, N = end of over N
  cumRuns: number;
  wickets: number; // wickets that fell during this over
}

/** Cumulative runs at the end of each over, for a worm/race chart. */
export function getWormSeries(overs: OverDocument[]): WormPoint[] {
  const sorted = [...overs].sort((a, b) => a.overNumber - b.overNumber);
  const points: WormPoint[] = [{ overNumber: 0, cumRuns: 0, wickets: 0 }];
  let cumRuns = 0;
  for (const over of sorted) {
    let runs = 0;
    let wickets = 0;
    for (const ball of over.balls) {
      runs += ball.runs + (ball.extras?.runs ?? 0);
      if (ball.dismissal) wickets++;
    }
    cumRuns += runs;
    points.push({ overNumber: over.overNumber + 1, cumRuns, wickets });
  }
  return points;
}

export type WagonWheelFilter =
  | { role: 'batsman'; playerId: string }
  | { role: 'bowler'; playerId: string };

/** Runs per wagon-wheel sector (0-11) for one batsman's shots or one bowler's deliveries. */
export function getWagonWheelData(overs: OverDocument[], filter: WagonWheelFilter): number[] {
  const data = new Array(12).fill(0);
  for (const over of overs) {
    if (filter.role === 'bowler' && over.bowlerId !== filter.playerId) continue;
    for (const ball of over.balls) {
      if (!ball.wagon) continue;
      if (filter.role === 'batsman' && ball.batsmanId !== filter.playerId) continue;
      data[ball.wagon.sector] += ball.runs;
    }
  }
  return data;
}

/** Unique batsman/bowler ids in order of first appearance, for selector pills. */
export function getInningsParticipants(overs: OverDocument[]): { batsmen: string[]; bowlers: string[] } {
  const sorted = [...overs].sort((a, b) => a.overNumber - b.overNumber);
  const batsmen: string[] = [];
  const bowlers: string[] = [];
  const seenBatsmen = new Set<string>();
  const seenBowlers = new Set<string>();
  for (const over of sorted) {
    if (!seenBowlers.has(over.bowlerId)) {
      seenBowlers.add(over.bowlerId);
      bowlers.push(over.bowlerId);
    }
    for (const ball of over.balls) {
      if (!seenBatsmen.has(ball.batsmanId)) {
        seenBatsmen.add(ball.batsmanId);
        batsmen.push(ball.batsmanId);
      }
    }
  }
  return { batsmen, bowlers };
}
