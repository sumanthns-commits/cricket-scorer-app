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

export interface Player {
  id: string;
  displayName: string;
  email?: string;
  type: PlayerType;
  activeClaim?: string | null;
  careerStats: CareerStats;
}

export type ExtrasType = 'wide' | 'no-ball' | 'bye' | 'leg-bye';

export interface DismissalEntry {
  type: string;
  fielderId?: string;
  bowlerId?: string;
}

export interface BallEntry {
  runs: number;
  batsmanId: string;
  extras?: { type: ExtrasType; runs: number };
  dismissal?: DismissalEntry;
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

export interface Match {
  id: string;
  clubId: string;
  homeTeam: string;
  awayTeam: string;
  date: Timestamp;
  status: 'scheduled' | 'live' | 'completed';
  rules: ClubRules;
}
