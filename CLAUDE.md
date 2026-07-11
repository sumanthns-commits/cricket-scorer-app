# Cricket Scorer — Mobile App

## What this is
React Native + Expo app for local cricket clubs.
Live scoring, player management, stats tracking, AI team selection.

## Stack
- React Native, Expo SDK managed workflow, TypeScript strict
- Firebase JS SDK v10 modular imports only
- React Navigation v6 (bottom tabs + native stack)
- Zustand for local state, React Query for server state (scorecard, TeamBuilder)
- Firebase AI SDK (`firebase/ai`, VertexAIBackend) with Gemini (gemini-2.5-flash) for AI assistant
- Cloud Functions in sibling repo `../cricket-scorer-functions` (Node 24, Gen 2, australia-southeast1)

## Folder structure
src/
  screens/{Feature}/index.tsx
  components/
  services/       ← all Firestore calls live here only
  hooks/
  store/
  types/index.ts  ← single source of truth for all types
  ai/             ← LLM assistant, tool definitions, tool executor
  constants/      ← clubRules defaults

## Absolute rules
- NO Firestore calls from components — always through src/services/
- NO direct read of player.careerStats — always through src/services/statsResolver.ts
- Modular Firebase only: import { doc, getDoc } from 'firebase/firestore'
- NO `any` types
- FieldValue.increment() for all stat counters — never read-modify-write
- All colours use inline style={{}} with explicit hex values — no Tailwind arbitrary values

## Match lifecycle (wizard flow)
ScheduleMatch → TeamBuilder → Toss → LiveScoring

- **ScheduleMatch**: collects match details + squad. Does NOT create a Firestore doc.
  Passes a `MatchDraft` (JSON-serializable) through nav params to TeamBuilder/Toss.
  "Reuse previous squad & teams" carries over teamA, teamB, captainA, captainB.
  Uses `navigation.navigate` (not replace) so back returns to the form.
- **TeamBuilder**: assigns squad players to Team A/B, sets captains, optional AI balance.
  In draft mode (no matchId): reads teams from `matchDraft`, passes updated draft to Toss.
  In edit mode (has matchId): writes directly to the existing match doc.
  Accepts `returnTo?: 'LiveScoring'` param — replaces back to LiveScoring after confirm.
- **Toss**: coin flip, toss winner + choice (bat/field), select scorer.
  In draft mode: calls `createLiveMatch()` which writes the match doc with `status:'live'`
  and the toss in a single shot. Match never exists in Firestore as 'scheduled'.
  In edit mode (existing matchId): calls `setMatchToss()` as before.
- **LiveScoring**: loads match state, reconstructs innings from ball docs.

## Matches list screen
Each card shows date + time (`createdAt`, local time, 12h with AM/PM — falls back to no
time shown for pre-`createdAt` matches, never crashes). Sort is live-first, then `date`
descending, then `createdAt` descending as a tiebreak for same-day matches (see `createdAt`
note below). `ScheduleMatch`'s "previous match" lookup (for squad reuse / quick rematch) uses
the same `date`-then-`createdAt` sort to find the true most-recently-created match.

## Match data model (`clubs/{clubId}/matches/{matchId}`)
```
status: 'live' | 'completed' | 'abandoned'   ← never 'scheduled' for new matches
squad: string[]        — all selected player IDs
teamA: string[]        — Team A player IDs
teamB: string[]        — Team B player IDs
captainA?: string      — captain ID for Team A
captainB?: string      — captain ID for Team B
substitutes?: string[] — mid-match substitute player IDs (arrayUnion/arrayRemove)
toss?: MatchToss       — winner, choice (bat/field), scorerId
rules: ClubRules       — snapshot at schedule time (live rules come from club doc)
inningsSummary?        — written by onMatchCompleted Cloud Function
createdAt?: Timestamp  — set at creation (createMatch/createLiveMatch). `date` is only a
                         calendar day (no time-of-day), so same-day quick rematches share
                         one `date` value — createdAt is the tiebreaker for sort order and
                         for finding the true "previous match" to reuse a squad from.
firstInningsEnded?: boolean — set when the scorer manually confirms "End Innings" (see
                         Manual innings/match end below). Absent/false ⇒ 1st innings
                         reconstructed-complete state is still 'end-pending', not sealed.
```

## Manual innings/match end (LiveScoring)
Reaching an end condition (all out / overs done / target chased) no longer auto-advances
to the sealed summary screen — it lands on phase `'end-pending'`: the scoring screen stays
up (run/extras/wicket buttons disabled) with an "End Innings"/"End Match" button, and
**Undo is still available** so the scorer can fix the last ball before sealing it. Tapping
End shows a confirm Alert ("can't be undone after this"), then:
- 1st innings: writes `firstInningsEnded: true` on the match (via `endFirstInnings()`),
  phase → `'innings-over'` (shows the "Start 2nd innings" summary).
- 2nd innings/match: phase → `'innings-over'` triggers the existing effect that calls
  `completeMatch()` (unchanged) — status flips to `'completed'`, which is itself the
  persisted "sealed" marker (a reload of an already-completed match never reaches
  LiveScoring's ball-reconstruction code at all — see the `status` guard in `load()`).
On reload, `resumePhaseFromBalls(..., sealed)` resumes to `'end-pending'` (not
`'innings-over'`) whenever the relevant seal flag isn't set, so undo survives app restarts
too, right up until the scorer explicitly seals it.

## Run-out crossing (commitBall / computeNextBatsmen)
Batsmen are **always assumed to have crossed** on the run that got someone out — true even
at 0 completed runs (very common: a single is attempted, they cross, one is sent back and
run out short). This flips the usual "odd completed runs ⇒ crossed" parity: `crossedOnRunOut
= completedRuns % 2 === 0` for run-outs specifically (not `!== 0`). Must stay identical in
both `commitBall` (live) and `computeNextBatsmen` (replay from stored balls on reload/undo),
and must NOT apply to non-run-out dismissals (they never carry nonzero `runs`, so the parity
flip would otherwise wrongly imply crossing on an ordinary bowled/caught ball).

## Ball storage (primary — new matches)
`matches/{matchId}/balls/{autoId}` — one doc per delivery (`BallDoc`):
```
seq: number              — monotonic, used for ordering
inningsId: string        — 'innings-1' | 'innings-2'
overNumber: number
bowlerId: string
batsmanId: string        — on-striker (facing batter, always)
nonStrikerId: string     — non-striker before this delivery
runs: number             — runs off the bat (excludes extras)
extras?: { type, runs }
wagon?: { sector, depth }
fielding?: { eventId?, eventLabel?, fielderIds? }
dismissal?: {
  type: string
  nonStrikerOut: boolean     — true when non-striker was dismissed
  outBatsmanId: string       — who got out (batsmanId or nonStrikerId)
  fielderIds?: string[]
  nextBatsmanId?: string     — patched via updateDoc after user selects replacement
}
isLastBallOfOver: boolean
```
Innings state is reconstructed purely from the ball sequence — no state snapshot stored.
Bowler selection is ephemeral (not stored); user re-selects if app is reopened mid-over.
Undo = `deleteLastBall()` which removes the last doc for the innings.

## Ball storage (legacy — old matches)
`matches/{matchId}/overs/{overId}` — each doc has `balls: BallEntry[]`.
`getMatchOvers()` checks `balls/` first; falls back to `overs/` if empty.
`adaptToBallDoc()` in `matchService.ts` handles old MatchEvent format for backward compat
(derives `isLastBallOfOver` from `state.isOverComplete`, skips non-ball event types).

## BallEntry fielding (legacy overs/ format)
```
fielding?: {
  eventId?: string
  eventLabel?: string   — snapshot label (survives rule edits)
  fielderId?: string    — legacy single fielder
  fielderIds?: string[] — multi-select; fanout to all selected fielders
}
```
`onMatchCompleted` handles both `fielderId` and `fielderIds`.
`seasonLeaderboard.ts` fans out via `fielderIds ?? [fielderId]`.

## Live scoring screen tabs
SCORING | SCORECARD | COMMENTARY | TEAMS | STATS

- **SCORING**: ball-by-ball entry, wagon wheel, fielding overlay, wicket sheet
- **SCORECARD**: batting + bowling tables, innings switcher in 2nd innings
- **COMMENTARY**: ball-by-ball text feed, newest ball first — see Commentary below.
- **TEAMS**: shows Team A/B rosters with captain badge (C); substitutes section
  with add/remove (admin only). "Edit Teams" button shown before first ball.
  Substitutes from any team/player pool can be added; they appear in fielding overlay.
- **STATS**: MatchStatsContent component (worm, wagon wheel, per-over stats)

Tab bar is a horizontally-scrollable `ScrollView` (equal fixed-width tabs, not `flex:1`) —
accent-colored circular chevron buttons appear at whichever edge(s) still have more tabs to
scroll to, and call `scrollTo` on the tab ScrollView's ref; they hide once fully scrolled.

Fielding overlay: multi-select vertical checklist (scrollable, maxHeight 160).
Panel auto-dismisses after 6 s of inactivity. Selected fielder(s) shown in summary line.

## Commentary (`services/commentary.ts` + `components/Commentary.tsx`)
`buildCommentary(balls, getName, handOf, customDismissals)` is a pure function that turns one
innings' `BallDoc[]` into ball-by-ball text lines ("0.4 Anand to Hegde. Out! Caught by Jai in
point.") plus "End of over N" divider entries, in chronological order — callers reverse for
newest-first display. Shown in LiveScoring's COMMENTARY tab (backed by new `activeBalls`/
`firstInningsBalls` state, kept in sync with `commitBall`/`handleUndo`/`startSecondInnings` so
it updates live) and in MatchScorecard's commentary tab for completed matches (via
`getMatchBalls`, not `getMatchOvers`'s `BallEntry` conversion — legacy `overs/`-only matches
with no `balls/` subcollection show "Commentary isn't available for this match" instead).

Wagon-wheel position names for commentary come from `src/constants/wagonPositions.ts`
(`RHB_WAGON_LABELS`/`LHB_WAGON_LABELS`/`wagonLabelFor`) — the **same canonical table** the
wagon wheel capture UI in LiveScoring uses. These must never diverge into a second table;
a scorer taps a position on the wheel and commentary must name it back the same way.

## MatchScorecard (spectator view)
Real-time for `status:'live'` matches only — `subscribeMatch`/`subscribeMatchBalls`
(`matchService.ts`) via `onSnapshot`, so a spectator sees the score update as the scorer
plays it, not just on reopen. Completed/abandoned matches use a plain one-shot fetch (no
listeners held open for static data) — which of the two paths is picked is decided once, at
mount, from a cheap one-shot "gate" read of the match doc's `status`. When the match-doc
listener reports the status has left `'live'`, both listeners are torn down and one
authoritative `getMatchBalls()` re-fetch runs immediately after — the balls listener's own
final snapshot isn't guaranteed to have landed before the "completed" snapshot did (two
independent listeners, no ordering guarantee), so this closes that race rather than risking
the last ball(s) never rendering.

## Domain: player types
- ghost      — imported from PDF/CSV (or seeded), no auth
- registered — has Firebase auth, a club member
- linked     — ghost merged into a registered member; stats folded in, hidden from selection

## Authoritative player model
Players: `clubs/{clubId}/players/{playerId}` with `type`, `role`, `careerStats`.
LEGACY top-level `players` collection backs onStatsImport + fuzzyMatcher only — unused elsewhere.
Build new code against the subcollection.

`PlayerProfileView`'s NAME field (admin-editable for any player, incl. ghosts) is a small
overlay modal with its own explicit Save button — not an always-editable inline field —
so it's unambiguous when the rename has actually been committed.

## Ghost linking (IMPLEMENTED)
Admin links ghost → member via `resolveJoinRequest({ ..., linkGhostId })`:
- `addCareerStats` folds ghost's careerStats into member's per-club doc. No cooldown.
- ghost → `type:'linked'`, `linkedTo: uid`; member gets `linkedGhost` pointer.
- Reversible: `unlinkGhost` subtracts frozen stats, restores `type:'ghost'`.
- `type:'linked'` suppressed from getClubPlayers, squad, AI selection.
- `publicPlayerStats` mirror (`uid_clubId`) kept in sync by `mirrorPlayerStats` trigger.

## Self-service claim lifecycle (PLANNED — NOT implemented)
Stats resolver only PREVIEWS a claim snapshot. Ghost→member linking is admin-only today.
open → cooldown → merged | cooldown → contested → admin resolves | merged → reverted

## Scoring engine rule
`scoringEngine.ts` only needs `dismissalConfig`. Engine is NOT aware of other rules.
UI controls which buttons show. `customDismissals` in ClubRules is the only engine-aware config.

## Cloud Functions (../cricket-scorer-functions)
Key functions:
- `onMatchCompleted` — aggregates career stats, fielding points, wagon wheel from balls/
  (falls back to overs/ for legacy matches). Handles both BallDoc and BallEntry formats.
  Also sends the "match finished" push notification (both its normal exit and its
  empty-squad early-return path).
- `mirrorPlayerStats` — syncs publicPlayerStats after per-club player writes
- `resolveJoinRequest` — ghost linking / join approval; also sends the "join approved"
  push notification to the requester
- `onJoinRequestCreated` — notifies a club's admins of a new join request
- `onMatchLive` — notifies registered members (minus the scorer) when a match goes live
- `onMatchAbandoned` — notifies registered members (minus the scorer) when a match is
  abandoned (kept separate from `onMatchCompleted`, whose guard never fires for 'abandoned')
- `linkGhost` / `unlinkGhost` — admin callable stat merge/reversal
- AI callables: `getAvailablePlayers`, `getPlayerStats`, `getPlayerForm`,
  `getBattingInsights`, `getBowlingInsights`, `getHeadToHead`, `getMatchContext`

Deploy: `firebase deploy --only functions` from `functions/` subdirectory.

## Push notifications
Expo push notifications (`expo-notifications` client-side, `expo-server-sdk` v5 — pinned
below v6 because v6+ is ESM-only and the functions repo compiles to CommonJS). Four triggers:
new join request → club admins; join request approved → the requester; match goes live →
registered members minus the scorer; match finishes (completed or abandoned) → registered
members minus the scorer. Only the two match-related sends respect the per-user opt-out
(`users/{uid}.notificationPrefs.matchNotifications`, default on, toggled in Profile) —
join-request/approval notifications always send.

Client: `src/services/pushTokenService.ts` registers the device's Expo push token onto
`users/{uid}.expoPushTokens` on sign-in (`useAuthListener.ts`, fire-and-forget) and removes
it on sign-out (`authService.ts`'s `signOut()`) — this app's real usage pattern is a shared
scorer's device passed between club volunteers, so without the sign-out cleanup one account's
token would linger and leak that account's notifications to whoever signs in next on the
same device.

Tap-to-navigate: no React Navigation `linking` config exists, so a tap is routed manually —
`src/navigation/navigationRef.ts` + `src/services/notificationNavigation.ts`
(`handleNotificationResponse`, `navigateToPending`). A tap that arrives before navigation is
possible (signed out, or a cold start racing `onAuthStateChanged`) queues into
`src/store/pendingNotificationStore.ts`; `replayPendingNavigation()` is the single choke
point that flushes it, called both from an auth-change effect in `RootNavigator.tsx` and
from `NavigationContainer`'s `onReady` in `App.tsx` — needed both ways round, since either
"auth resolves" or "nav becomes ready" can be the one that happens second.

Push delivery cannot be exercised in the iOS Simulator at all, and needs a native rebuild
(`expo-notifications` bundles native code) plus, for iOS, a one-time APNs key via
`eas credentials`.

## AI tools — DATA ONLY, no reasoning in tools
Tools return structured JSON. LLM does all reasoning.
Returns JSON teams + rationale → app parses → `createMatchTeams` Function persists.

## Auth
Firebase ID token via `getAuth().currentUser.getIdToken(false)`
API key from `Constants.expoConfig.extra.apiKey` (injected via EAS Secrets)
Never store tokens to disk. Never commit .env

## Wagon wheel orientation
Keeper's view (behind the batsman). Batsman at BOTTOM, bowler at TOP.
0° = top (straight/toward bowler), clockwise positive.
RHB: off side = RIGHT, leg side = LEFT. LHB: labels flip, geometry stays same.
12 uniform 30° sectors, 2° gap between each.

## Env vars (in .env, gitignored)
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_MCP_URL
API_KEY
EXPO_PUBLIC_USE_EMULATOR=true for local dev

## QA & Regression Testing
Full scenario list lives in `docs/qa-test-scenarios.md` (14 sections, A–N, ~60 scenarios).

To run a full regression suite, invoke the `cricket-app-qa-tester` agent:
```
@"cricket-app-qa-tester (agent)" Run the full regression suite from docs/qa-test-scenarios.md.
Boot the Android emulator (Medium_Tablet AVD), launch com.crease.cricket, test all scenarios
and produce a PASS/FAIL report.
```

Critical regression targets on every release (must all PASS):
- F7/F8: Wide +0 no strike rotation; Wide +1 rotates strike
- F11/F12: No-ball same as wide for strike rotation
- F14/F15/G3: Bye/LB not charged to bowler economy
- F16: Bye/LB run picker shows 1–6
- F20/F21: Non-striker run-out toggle (WHO WAS RUN OUT? card)
- F26: maxBowlerOvers cap excludes bowler from picker
- C7: Abandoned match excluded from prevMatch
- C2/C3/C4/C5/M4: Linked ghost excluded from all squad reuse paths
- G4: BowlerRow economy uses match ballsPerOver, not hardcoded 6
- J5: sealedRef guard prevents double match completion

Emulator tap coordinate note: device is 2560×1600; screencap displayed at 2000×1250 in
viewer — multiply displayed coords by 1.28 to get device tap coordinates.
