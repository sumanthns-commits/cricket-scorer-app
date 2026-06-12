import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';
import { callCallableFunction } from './functionsClient';
import type { BattingHand, BowlingStyle, CareerStats, Claim, Player, StrengthOverride, WicketKeepingAbility } from '../types';

export async function updatePlayerAttributes(
  clubId: string,
  playerId: string,
  attrs: { displayName?: string; battingHand?: BattingHand; bowlingStyle?: BowlingStyle; wicketKeeping?: WicketKeepingAbility | null }
): Promise<void> {
  const update: Record<string, unknown> = { ...attrs };
  if (attrs.wicketKeeping === null) update.wicketKeeping = deleteField();
  await updateDoc(doc(db, 'clubs', clubId, 'players', playerId), update);
}

export async function updateStrengthOverride(
  clubId: string,
  playerId: string,
  override: StrengthOverride
): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId, 'players', playerId), { strengthOverride: override });
}

/**
 * Stats derived purely from career totals.
 * Per project rules we NEVER read or display stored averages — always recompute.
 */
export interface DerivedStats {
  battingAverage: number | null; // null = not out / no dismissals yet
  strikeRate: number | null;
  bowlingAverage: number | null;
  economy: number | null;
  bowlingStrikeRate: number | null;
  oversBowled: number;
  matchesPlayed: number;
  highScore: number;
  totalRuns: number;
  totalWickets: number;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function computeDerivedStats(stats: CareerStats): DerivedStats {
  return {
    battingAverage: ratio(stats.totalRuns, stats.totalDismissals),
    strikeRate:
      stats.totalBallsFaced > 0
        ? (stats.totalRuns / stats.totalBallsFaced) * 100
        : null,
    bowlingAverage: ratio(stats.totalRunsConceded, stats.totalWickets),
    economy:
      stats.totalBallsBowled > 0
        ? stats.totalRunsConceded / (stats.totalBallsBowled / 6)
        : null,
    bowlingStrikeRate: ratio(stats.totalBallsBowled, stats.totalWickets),
    oversBowled: Math.floor(stats.totalBallsBowled / 6) + (stats.totalBallsBowled % 6) / 10,
    matchesPlayed: stats.matchesPlayed,
    highScore: stats.highScore,
    totalRuns: stats.totalRuns,
    totalWickets: stats.totalWickets,
  };
}

/** A computed 0–100 rating used when a player has no stored skillRating. */
export function computeSkillRating(stats: CareerStats): number {
  const derived = computeDerivedStats(stats);
  const battingScore = Math.min((derived.strikeRate ?? 0) / 2, 60); // ~120 SR → 60
  const wicketScore = Math.min(stats.totalWickets * 2, 30);
  const experience = Math.min(stats.matchesPlayed, 10);
  return Math.round(Math.min(battingScore + wicketScore + experience, 100));
}

export async function getPlayer(clubId: string, playerId: string): Promise<Player | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'players', playerId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Player;
}

export async function getActiveClaim(
  clubId: string,
  claimId: string
): Promise<Claim | null> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'claims', claimId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Claim;
}

export interface FormEntry {
  matchId: string;
  label: string;
  runs: number;
  ballsFaced: number;
  wickets: number;
  notOut: boolean;
}

interface RawFormMatch {
  matchId?: string;
  opponent?: string;
  label?: string;
  runs?: number;
  ballsFaced?: number;
  wickets?: number;
  notOut?: boolean;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Last-N-match form, fetched through the AI data function. Degrades to [] on failure. */
export async function getPlayerForm(
  clubId: string,
  playerId: string,
  lastNMatches = 5
): Promise<FormEntry[]> {
  const raw = await callCallableFunction('get_player_form', {
    clubId,
    playerId,
    lastNMatches,
  });

  const matches: RawFormMatch[] = Array.isArray(raw)
    ? (raw as RawFormMatch[])
    : ((raw as { matches?: RawFormMatch[] })?.matches ?? []);

  // The function returns newest-first (to apply the limit); reverse so the
  // chart reads chronologically, oldest on the left.
  return matches
    .slice()
    .reverse()
    .map((m, i) => ({
      matchId: m.matchId ?? String(i),
      label: m.label ?? m.opponent ?? `M${i + 1}`,
      runs: toNumber(m.runs),
      ballsFaced: toNumber(m.ballsFaced),
      wickets: toNumber(m.wickets),
      notOut: m.notOut === true,
    }));
}

/** Runs per wagon-wheel sector. Index 0 = straight (toward bowler), clockwise. */
export type WagonWheelData = number[]; // length 12

interface RawBattingInsights {
  wagonWheel?: Array<number | { sector?: number; runs?: number }>;
  batsmanHand?: 'RHB' | 'LHB';
}

export interface BattingInsights {
  wagonWheel: WagonWheelData;
  batsmanHand: 'RHB' | 'LHB';
}

export async function getBattingInsights(
  clubId: string,
  playerId: string
): Promise<BattingInsights> {
  const raw = (await callCallableFunction('get_batting_insights', {
    clubId,
    playerId,
  })) as RawBattingInsights;

  const wagonWheel: WagonWheelData = new Array<number>(12).fill(0);
  const entries = raw?.wagonWheel ?? [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (typeof entry === 'number') {
      if (i < 12) wagonWheel[i] = entry;
    } else if (entry && typeof entry === 'object') {
      const sector = toNumber(entry.sector, i);
      if (sector >= 0 && sector < 12) wagonWheel[sector] = toNumber(entry.runs);
    }
  }

  return { wagonWheel, batsmanHand: raw?.batsmanHand === 'LHB' ? 'LHB' : 'RHB' };
}
