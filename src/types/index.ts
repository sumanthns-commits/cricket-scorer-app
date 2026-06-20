import type { Timestamp } from 'firebase/firestore';

export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: Timestamp;
  // Global player profile fields, editable by the user and visible to a club
  // admin reviewing their join request (see EditProfile / RequesterProfile).
  battingHand?: BattingHand;
  bowlingStyle?: BowlingStyle;
  wicketKeeping?: WicketKeepingAbility;
  bio?: string;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface JoinRequest {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  status: JoinRequestStatus;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
}

// Public, server-written mirror of a registered player's per-club career stats
// (publicPlayerStats/{uid}_{clubId}). Lets a club admin review a requester's
// record across every club without reading member-private player docs.
export interface PublicPlayerStats {
  uid: string;
  clubId: string;
  clubName: string;
  displayName: string;
  photoURL?: string | null;
  careerStats: CareerStats;
  updatedAt: Timestamp;
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
  totalStumpings: number;
  highScore: number;
  matchesPlayed: number;
  // Tally of configured fielding events credited to this player, keyed by the
  // event label at the time (e.g. { "Great stop": 3, "Drop": 1 }).
  fieldingEventCounts?: Record<string, number>;
  // Net rating points from non-dismissal fielding events, baked in at match
  // completion from each event's polarity (positive adds, negative subtracts).
  // Stored as a scalar so computeSkillRating stays pure on CareerStats.
  fieldingPoints?: number;
}

// Stats accumulated only in matches where the player was a team captain.
export interface CaptainStats {
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  runs: number;
  ballsFaced: number;
  dismissals: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  highScore: number;
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

export type FieldingPolarity = 'positive' | 'negative' | 'neutral';

export interface FieldingEventConfig {
  id: string;
  label: string;
  enabled: boolean;
  // How this event affects the fielder's rating. Admin-controlled in the rules
  // screen. Resolved to signed points at match completion (see scoring rules).
  polarity: FieldingPolarity;
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
  // Drives Summer/Winter season naming. Optional: clubs created before this
  // field existed read as 'N'.
  hemisphere?: 'N' | 'S';
  // Set when an admin archives the club; null/absent while active. A scheduled
  // Cloud Function permanently deletes the club and all its matches 30 days
  // after this timestamp.
  archivedAt?: Timestamp | null;
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
export type WicketKeepingAbility = 'keeper' | 'can-keep';

// Pointer left on a registered member after an admin links a ghost into them at
// join-approval. The ghost's stats are merged into the member's careerStats; the
// ghost doc (type:'linked') keeps the frozen copy used to reverse the merge.
export interface LinkedGhost {
  ghostId: string;
  displayName: string;
  linkedAt: Timestamp;
}

// Admin-set subjective strength ratings (0–100) per skill dimension.
// Separate from careerStats — stored for AI team balancing context only.
export interface StrengthOverride {
  batting?: number;
  fielding?: number;
  bowling?: number;
  keeping?: number;
}

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
  wicketKeeping?: WicketKeepingAbility;
  captainStats?: CaptainStats;
  // Set on a registered member that absorbed a ghost; absent otherwise.
  linkedGhost?: LinkedGhost;
  // Set on a ghost doc once linked into a member (type becomes 'linked').
  linkedTo?: string;
  // Admin-set subjective strength overrides for AI team selection (0–100 each).
  // Does not affect careerStats or any computed ratings.
  strengthOverride?: StrengthOverride;
}

export type ExtrasType = 'wide' | 'no-ball' | 'bye' | 'leg-bye';

export interface DismissalEntry {
  type: string;
  fielderId?: string;
  fielderIds?: string[]; // run-outs may involve multiple fielders
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
  fielding?: { eventId?: string; eventLabel?: string; fielderId?: string; fielderIds?: string[] };
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
  // Current batters at the end of this over (written on every ball save so
  // reconstruction after sign-out gets the correct pair without replaying rotations).
  onStrikeId?: string;
  offStrikeId?: string;
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

export interface ImportedBatterEntry {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  dismissalText?: string;
}

export interface ImportedBowlerEntry {
  id: string;
  balls: number;
  runs: number;
  wickets: number;
}

export interface InningsSummary {
  batting: ImportedBatterEntry[];
  bowling: ImportedBowlerEntry[];
  totalRuns: number;
  totalWickets: number;
  overs: string;
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
  captainA?: string;
  captainB?: string;
  winnerTeam?: 'A' | 'B' | 'tie';
  toss?: MatchToss;
  result?: string;
  inningsSummary?: Record<string, InningsSummary>;
  scorerId?: string;
  scorerName?: string;
  substitutes?: string[];
}
