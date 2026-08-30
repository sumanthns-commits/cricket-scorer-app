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
  // Expo push tokens for every device this user has granted notification
  // permission on (see pushTokenService.ts) — array since a user may have
  // more than one device.
  expoPushTokens?: string[];
  // Missing/undefined matchNotifications means ON (default) — every read
  // site must treat it that way, never write a default at doc creation.
  notificationPrefs?: { matchNotifications?: boolean };
}

// Tap-through payload for a push notification — shared shape between the
// Cloud Function that builds it and the client's tap-to-navigate handler.
export type PushNotificationData =
  | { type: 'join_request'; clubId: string }
  | { type: 'join_approved'; clubId: string }
  | { type: 'made_admin'; clubId: string }
  | { type: 'match_live'; clubId: string; matchId: string }
  | { type: 'match_finished'; clubId: string; matchId: string }
  | { type: 'match_poll'; clubId: string; pollId: string };

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

// A single choice on a match interest poll. `schedulable` is set once at poll
// creation (see matchPollService.createMatchPoll) — it's what lets the results
// screen show a "Schedule this match" button for e.g. "Yes"/"Sunday"/"Monday"
// but never for "No". `proposedDate` is only present on options that map to
// an actual candidate match date.
export interface PollOption {
  id: string;
  label: string;
  proposedDate?: Timestamp;
  schedulable: boolean;
  // Minimum respondent count for this option before it's considered "on" —
  // only meaningful when schedulable is true. Unset means the reminder
  // sweep and Game's on/off notifications never engage for this option.
  minResponses?: number;
}

// Recorded once a schedulable option has been turned into a real match, so the
// results screen can hide that option's "Schedule" button and link to the
// match instead. A single poll may accumulate more than one of these (e.g. a
// multi-date poll converted into both a Sunday and a Monday match).
export interface ConvertedPollMatch {
  matchId: string;
  optionId: string;
  convertedAt: Timestamp;
}

export interface MatchPoll {
  id: string;
  clubId: string;
  createdBy: string;
  createdByName: string;
  question: string;
  // false: respondent picks exactly one option (simple yes/no interest poll).
  // true: respondent may check any number of options (multi-date poll)
  // — deliberately no "Both"/"Neither" options exist for that case, since
  // multi-select already covers checking two boxes or none.
  multiSelect: boolean;
  options: PollOption[];
  venue?: string;
  note?: string;
  convertedMatches: ConvertedPollMatch[];
  createdAt: Timestamp;
  // One day after the max proposedDate across all options, computed once at
  // creation (matchPollService.createMatchPoll) — once this passes, the poll
  // is considered irrelevant: hidden from the MatchPolls list client-side,
  // and permanently deleted (poll doc + responses) by the
  // cleanupExpiredPolls scheduled Cloud Function.
  expiresAt: Timestamp;
  // Bookkeeping for the sendPollReminders scheduled Cloud Function — when it
  // last evaluated this poll, so the 4-hourly cadence survives the sweep's
  // exact run timing drifting. Defaults to createdAt at poll creation, so
  // the first eligible reminder window starts a clean 4h after the poll
  // goes out (not immediately after the "New match poll" push).
  lastReminderCheckAt?: Timestamp;
  // Per schedulable optionId: true once its minResponses threshold is
  // currently met. A live toggle, not a one-time flag — flips back to false
  // (and fires "Game's off!") if responses drop back below the minimum
  // after having been met, and can flip on again later. Absent/false keys
  // mean "never reached, or currently below" — both read the same way by
  // the reminder sweep and the response-write trigger.
  optionThresholdMet?: Record<string, boolean>;
}

// clubs/{clubId}/matchPolls/{pollId}/responses/{uid} — doc id is the
// responder's own uid, same shape as JoinRequest's self-scoped doc id.
export interface PollResponse {
  uid: string;
  displayName: string;
  optionIds: string[];
  respondedAt: Timestamp;
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
  // Whether this event appears for wicket dismissals, non-wicket balls, or both.
  // Absent on legacy events — treated as 'both'.
  scope?: 'wicket' | 'non-wicket' | 'both';
  // When scope is 'wicket', optionally restrict to specific dismissal types
  // (e.g. ['caught', 'run-out']). Empty or absent means all supported wicket types.
  wicketTypes?: string[];
}

export interface ClubRules {
  ballsPerOver: number;
  oversPerInnings?: number;
  enabledDismissals: StandardDismissalType[];
  customDismissals: CustomDismissal[];
  enabledExtras: ExtrasType[];
  roverThrowCap?: number;
  lastManStands: boolean;
  autoRotateStrikeEoO: boolean;
  compulsoryRetirementAt?: number;
  maxBowlerOvers?: number;
  fieldingEvents: FieldingEventConfig[];
  // When true, the fielding overlay auto-opens after every non-wicket ball.
  // When false (default), it's skipped for normal runs to keep scoring quick —
  // fielders are still always selected when a wicket falls.
  fieldingOverlayEveryBall: boolean;
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
  // Set when a registered member leaves/is removed (type flips to 'ghost' at
  // the same time) — careerStats is left untouched. Absent = normal/active.
  // Cleared (not set to some 'active' string) if the same uid rejoins.
  status?: 'departed';
  departedAt?: Timestamp;
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
 * sector: 0–11, 30° each, clockwise from 0 = straight (toward bowler). Purely
 *   geometric — hand-independent (a tap at the same screen position always
 *   yields the same sector, regardless of who's batting).
 * depth:  0 = infield, 1 = mid, 2 = boundary.
 * isLHB:  the batter's hand *as used to orient the wheel at capture time*
 *   (which can be manually flipped mid-innings and may differ from the
 *   player's profile `battingHand`). Snapshotted here — same reasoning as
 *   `fielding.eventLabel` — so sector→position-name translation (off/leg
 *   side mirrors between hands) stays correct even if the profile's hand
 *   is edited later. Absent on balls recorded before this field existed;
 *   consumers should fall back to the player's current battingHand.
 */
export interface WagonShot {
  sector: number;
  depth: number;
  isLHB?: boolean;
}

export interface BallEntry {
  runs: number;
  batsmanId: string;
  // Set only for non-striker run-outs, where batsmanId is the dismissed non-striker
  // rather than the batsman who faced the ball. Undo uses this to restore correct on-strike.
  onStrikeId?: string;
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
  onStrikeId?: string;
  offStrikeId?: string;
}

// One Firestore doc per ball in matches/{matchId}/balls/{autoId}.
// Self-contained: all facts about a single delivery are on this document.
// nonStrikerId + dismissal.nextBatsmanId let the app reconstruct crease state
// purely from ball documents — no separate batsman-in or bowler-in events.
export interface BallDoc {
  id: string;
  seq: number;                    // monotonic, used for ordering
  inningsId: string;
  overNumber: number;
  bowlerId: string;
  batsmanId: string;              // on-striker (always the facing batter)
  nonStrikerId: string;           // non-striker before this delivery
  runs: number;                   // runs off the bat (excludes extras)
  extras?: { type: string; runs: number };
  wagon?: WagonShot;
  fielding?: { eventId?: string; eventLabel?: string; fielderIds?: string[] };
  dismissal?: {
    type: string;
    nonStrikerOut: boolean;       // true when it was the non-striker who was dismissed
    outBatsmanId: string;         // who got out (batsmanId or nonStrikerId)
    fielderIds?: string[];
    nextBatsmanId?: string;       // set via updateDoc after user selects replacement
  };
  isLastBallOfOver: boolean;
}

export type MatchFormat = 'T20' | 'ODI' | 'custom';

export interface MatchToss {
  winnerId: 'homeTeam' | 'awayTeam';
  winnerName: string;
  choice: 'bat' | 'field';
}

export interface TeamSelectionResult {
  team_a: string[];
  team_b: string[];
  captain_a?: string;
  captain_b?: string;
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
  // Set at creation time. `date` is only a calendar day (no time-of-day) the
  // scorer picked, so same-day rematches share an identical `date` — this is
  // the tiebreaker that recovers actual creation order for sorting/reuse.
  createdAt?: Timestamp;
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
  firstInningsEnded?: boolean;
}
