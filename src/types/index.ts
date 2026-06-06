import type { Timestamp } from 'firebase/firestore';

export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: Timestamp;
}

export interface UserMembership {
  uid: string;
  clubIds: string[];
}

export type PlayerType = 'ghost' | 'registered' | 'linked';

export type ClaimStatus =
  | 'cooldown'
  | 'waiting'
  | 'contested'
  | 'merged'
  | 'reverted'
  | 'rejected';

export interface CareerStats {
  totalRuns: number;
  totalWickets: number;
  totalBallsFaced: number;
  totalDismissals: number;
  totalBallsBowled: number;
  totalRunsConceded: number;
  totalCatches: number;
  totalRunOuts: number;
  highScore: number;
  matchesPlayed: number;
}

export interface ClaimSnapshot {
  ghostStats: CareerStats;
  ghostSkillRating: number;
  snapshotAt: Timestamp;
}

export interface Claim {
  id: string;
  ghostId: string;
  claimantId: string;
  status: ClaimStatus;
  snapshot: ClaimSnapshot;
  createdAt: Timestamp;
  mergeScheduledAt?: Timestamp;
  contestedAt?: Timestamp;
  mergedAt?: Timestamp;
  revertedAt?: Timestamp;
}

export interface ResolvedStats {
  playerId: string;
  stats: CareerStats;
  statsSource: 'live' | 'snapshot' | 'preview';
}

export type StandardDismissalType =
  | 'caught'
  | 'bowled'
  | 'lbw'
  | 'run-out'
  | 'stumped'
  | 'hit-wicket'
  | 'obstructing-field'
  | 'timed-out'
  | 'handled-ball'
  | 'hit-ball-twice';

export interface CustomDismissal {
  id: string;
  label: string;
  batterIsOut: boolean;
  runsScored?: number;
  isLegalDelivery: boolean;
  bowlerGetsWicket: boolean;
}

export interface FieldingEventConfig {
  id: string;
  label: string;
  enabled: boolean;
}

export interface ClubRules {
  ballsPerOver: number;
  oversPerInnings?: number;
  enabledDismissals: StandardDismissalType[];
  customDismissals: CustomDismissal[];
  enabledExtras: ExtrasType[];
  roverThrowCap?: number;
  lastManStands: boolean;
  compulsoryRetirementAt?: number;
  maxBowlerOvers?: number;
  fieldingEvents: FieldingEventConfig[];
}

export interface Club {
  id: string;
  name: string;
  description: string;
  rules: ClubRules;
  createdAt: Timestamp;
  createdBy: string;
}

export interface ClubMember {
  id: string;
  clubId: string;
  playerId: string;
  role: 'admin' | 'member';
  joinedAt: Timestamp;
}

export type BattingHand = 'RHB' | 'LHB';
export type BowlingStyle = 'fast' | 'medium' | 'spin';

export interface Player {
  id: string;
  displayName: string;
  email?: string;
  type: PlayerType;
  activeClaim?: string | null;
  careerStats: CareerStats;
  photoURL?: string;
  skillRating?: number;
  battingHand?: BattingHand;
  bowlingStyle?: BowlingStyle;
}

export type ExtrasType = 'wide' | 'no-ball' | 'bye' | 'leg-bye';

export interface DismissalEntry {
  type: string;
  fielderId?: string;
  bowlerId?: string;
}

/**
 * Wagon-wheel shot location.
 * sector: 0–11, 30° each, clockwise from 0 = straight (toward bowler).
 * depth:  0 = infield, 1 = mid, 2 = boundary.
 */
export interface WagonShot {
  sector: number;
  depth: number;
}

export interface BallEntry {
  runs: number;
  batsmanId: string;
  extras?: { type: ExtrasType; runs: number };
  dismissal?: DismissalEntry;
  wagon?: WagonShot;
  fielding?: { eventId?: string; fielderId?: string };
  timestamp?: Timestamp;
}

export interface OverDocument {
  id: string;
  matchId: string;
  inningsId: string;
  overNumber: number;
  bowlerId: string;
  balls: BallEntry[];
  isComplete: boolean;
}

export type MatchFormat = 'T20' | 'ODI' | 'custom';

export interface MatchToss {
  winnerId: string;
  winnerName: string;
  choice: 'bat' | 'field';
}

export interface TeamSelectionResult {
  team_a: string[];
  team_b: string[];
  rationale: string;
  keyDecisions: string[];
}

export interface Match {
  id: string;
  clubId: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  date: Timestamp;
  format?: MatchFormat;
  status: 'scheduled' | 'live' | 'completed' | 'abandoned';
  rules: ClubRules;
  squad?: string[];
  teamA?: string[];
  teamB?: string[];
  toss?: MatchToss;
  result?: string;
}
