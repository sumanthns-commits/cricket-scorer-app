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

## NO EAS BUILD — but eas credentials is fine
This project uses the **Expo SDK** (the library/framework — `expo-notifications`, `expo
prebuild`, etc.) but does **not** use **EAS Build** (the cloud compile pipeline) or EAS
Update — all builds are local and already scripted: `build-ios.sh` (iOS archive + IPA via
local `xcodebuild`) and `build-local.sh` (Android release AAB via local Gradle), both
gitignored-secrets-backed (`build-secrets.sh`), both already working. Do not propose
`eas build` or EAS Update as a fix for anything.

`eas credentials` (the narrow, one-time credential-registration command — no cloud
compiling involved) **is** acceptable — it's how push notification credentials (APNs key,
FCM service account) get registered with Expo's push relay, and doesn't require using EAS
Build for anything else.

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

- **ScheduleMatch**: collects match details + squad. Does NOT create a Firestore doc itself
  (except the "Quick rematch" shortcut below) — passes a `MatchDraft` (JSON-serializable)
  through nav params to TeamBuilder. "Reuse previous squad & teams" carries over teamA,
  teamB, captainA, captainB. Uses `navigation.navigate` (not replace) so back returns to the
  form. "Quick rematch" mode skips TeamBuilder entirely and calls `createMatch()` itself
  (teams/captains cloned from the previous match), straight to Toss with a `matchId`.
- **TeamBuilder**: assigns squad players to Team A/B, sets captains, optional AI balance
  (see "AI Balance" below — now also picks captains, weighted against whoever captained in
  the last 4 weeks). In draft mode (no matchId): on confirm, calls `createMatch()` — writes
  the match doc as `status:'scheduled'` — then navigates to Toss with the new `matchId`. This
  is what makes the match visible/deletable/re-editable from Matches before the toss is ever
  confirmed (see "Match creation & scheduled state" below). In edit mode (has matchId):
  writes directly to the existing match doc via `setMatchTeams()`. Accepts `returnTo?:
  'LiveScoring'` param — replaces back to LiveScoring after confirm (only reachable pre-match,
  via LiveScoring's TEAMS tab "Edit Teams" button, gated on `!matchHasStarted`).
- **Toss**: coin flip, toss winner + choice (bat/field). Scorer is auto-assigned at
  confirmation time, not picked — whoever confirms the toss becomes `scorerId`/`scorerName`
  (name resolved via `getPlayer` for the club-scoped display name, falling back to the Auth
  profile name/email), via `setMatchToss()`, which also flips `status: 'scheduled' → 'live'`.
  Always operates on an existing `matchId` — the match doc is created earlier, by
  `TeamBuilder`'s confirm step (see "Match creation & scheduled state" below), not here.
  See "Scorer handover" below for reassigning `scorerId` after this point.
- **LiveScoring**: loads match state, reconstructs innings from ball docs.

## Match creation & scheduled state
`createMatch()` (`matchService.ts`) writes a new match doc with `status:'scheduled'` —
called from `TeamBuilder`'s draft-mode confirm and `ScheduleMatch`'s "Quick rematch" shortcut.
A scheduled match is fully visible/manageable from `Matches`/`ClubDetail` before the toss:
`STATUS_COLORS` includes `'scheduled'`, `handleDelete` allows deleting it, and a card with
teams already assigned gets an "Edit Teams" link (reopens `TeamBuilder` in edit mode)
alongside the normal "Toss →" tap action. `setMatchToss()` is the only thing that flips
`status: 'scheduled' → 'live'`. There's no dead-end: a scheduled match can be deleted,
re-teamed, or carried through to Toss at any point.

## Scorer handover
Only the current scorer gets scoring controls in `LiveScoring` — enforced by `isMatchScorer()`
(`matchService.ts`, shared by `Matches`/`ClubDetail`'s routing AND `LiveScoring` itself via an
`isScorer` check on the main scoring-controls render branch). This used to be `isAdmin`-gated
inside `LiveScoring`, which let every admin score simultaneously regardless of `scorerId` —
now a non-scorer admin sees the same read-only view as a spectator (`"{name} is scoring this
match"`), plus a **"Take over scoring"** button.

- `takeOverScoring()` reassigns `scorerId`/`scorerName` — a plain last-write-wins `updateDoc`
  (not a transaction; deliberate one-off human action via a confirm `Alert`, not a tight race).
  After a successful takeover, `LiveScoring` calls `load()` again rather than just patching
  local state, since the new scorer's screen was never kept live while only watching and may
  be stale relative to whatever the outgoing scorer last committed.
- The outgoing scorer's screen doesn't need to background/refocus to notice — `LiveScoring`
  holds a live `subscribeMatch()` listener scoped to just `scorerId`/`scorerName` (the rest of
  `match` state stays one-shot, refreshed on focus) that flips `isScorer` false and shows an
  Alert the moment the takeover write lands.
- `commitBall()` re-checks `isMatchScorer` at the top as a second guard beyond hiding the
  buttons — covers a modal (e.g. the wicket sheet) that was already open when scoring got
  handed over mid-flow.
- `ScoreHeader` (`components/LiveScoreboard.tsx`, shared by `LiveScoring` and
  `MatchScorecard`'s live tab) shows `"Scoring: {scorerName}"` to everyone viewing the match —
  scorer, other admins, and spectators alike.
- Firestore rules do NOT enforce scorer-exclusivity (`balls`/`overs` writes only require
  `isMember(clubId)`) — this is a client-side UX guard, not a security boundary.
- `LiveScoring`'s `load()` (the `useCallback` that fetches the match + computes `isAdmin`)
  must list `user?.uid` in its dependency array, not just `[clubId, matchId]`. Without it,
  if the screen mounts before Firebase Auth resolves, `load` permanently captures a stale
  `user = null` closure — the admin-role check never re-runs once auth catches up, so
  `isAdmin` sticks at `false` for that screen's whole lifetime and the "Take over scoring"
  button silently never appears for a genuine admin. Fixed 2026-08; watch for the same
  pattern in any other screen with a `useCallback`-memoized loader that reads `user`.

## Matches list screen
Each card shows date + time (`createdAt`, local time, 12h with AM/PM — falls back to no
time shown for pre-`createdAt` matches, never crashes). Sort is live-first, then `date`
descending, then `createdAt` descending as a tiebreak for same-day matches (see `createdAt`
note below). `ScheduleMatch`'s "previous match" lookup (for squad reuse / quick rematch) uses
the same `date`-then-`createdAt` sort to find the true most-recently-created match.

## Match data model (`clubs/{clubId}/matches/{matchId}`)
```
status: 'scheduled' | 'live' | 'completed' | 'abandoned'
squad: string[]        — all selected player IDs
teamA: string[]        — Team A player IDs
teamB: string[]        — Team B player IDs
captainA?: string      — captain ID for Team A
captainB?: string      — captain ID for Team B
substitutes?: string[] — mid-match substitute player IDs (arrayUnion/arrayRemove)
toss?: MatchToss       — winner, choice (bat/field) — set once, at Toss confirm; not present
                         while status is 'scheduled'
scorerId?: string      — set alongside toss at Toss confirm; reassignable afterwards via
                         takeOverScoring() — see "Scorer handover" above
scorerName?: string    — display name for scorerId, snapshotted at assignment time
rules: ClubRules       — snapshot at schedule time (live rules come from club doc)
inningsSummary?        — written by onMatchCompleted Cloud Function
createdAt?: Timestamp  — set at creation (createMatch). `date` is only a calendar day
                         (no time-of-day), so same-day quick rematches share one `date`
                         value — createdAt is the tiebreaker for sort order and for finding
                         the true "previous match" to reuse a squad from.
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
wagon?: { sector, depth, isLHB? }
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

`dismissal.fielderIds` is **always normalized to an array at write time** (`commitBall`,
LiveScoring), even for a single fielder — never rely on a singular `fielderId` on the
persisted doc; it doesn't exist on `BallDoc` (only on the legacy `DismissalEntry`/`BallEntry`
shape). A single-fielder catch/stumping omitting this normalization silently drops the
fielder from Firestore entirely (no fallback field to recover it from) — this happened
historically; fixed going forward only, not backfilled for matches scored before the fix.

`wagon.isLHB` snapshots the batter's hand **as used to orient the wheel at the moment of
capture** — not the player's profile `battingHand`. The wheel's hand (`innings.handedness`)
is session-only and can be manually flipped mid-innings (`toggleHand`) independently of the
profile, e.g. when the profile's hand is wrong. `sector` itself is pure geometry (hand-
independent); only the sector→position-name translation depends on hand, and that
translation must always prefer `wagon.isLHB` over `player.battingHand` (see Commentary
below) — using the profile instead re-mirrors the position to the wrong side whenever the
two diverge. Absent on balls recorded before this field existed; fall back to profile hand
for those.

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

- **SCORING**: ball-by-ball entry, wagon wheel, fielding overlay, wicket sheet. Run buttons:
  `0 1 2 3` / `4 6 Custom` (Custom opens a stepper modal, no upper bound — for rare values
  like overthrows past 6; `5` was deliberately dropped as uncommon enough to route through
  Custom instead of costing its own slot). Extras (wide/no-ball/bye/leg-bye) are entirely
  driven by `match.rules.enabledExtras` — no exceptions carved out for any of the four.
  "This over" ball strip is a fixed 6-spot window: `InningsState.previousOverBalls` (last 3
  balls of the prior over) fills spots the current over hasn't used yet, dimmed and labelled
  "Prev:", dropping off one at a time as real current-over balls arrive — keeps context across
  the over boundary instead of the strip going blank on a fresh over. Computed in three places
  that all touch `InningsState` (`beginInnings`, `buildInningsFromBalls` reload reconstruction,
  `commitBall` incremental update on over completion) — must stay in sync if `InningsState`
  gains another over-scoped field.
- **SCORECARD**: batting + bowling tables, innings switcher in 2nd innings
- **COMMENTARY**: ball-by-ball text feed, newest ball first — see Commentary below.
- **TEAMS**: shows Team A/B rosters with captain badge (C); substitutes section
  with add/remove (admin only). "Edit Teams" button shown before first ball.
  Substitutes from any team/player pool can be added; they appear in fielding overlay.
- **STATS**: MatchStatsContent component (worm, wagon wheel, per-over stats)

Fielding pickers (FieldingPanel's checklist + WicketSheet's caught/stumped/run-out fielder
lists — both fed by the single `fieldingPlayers` var) include **both teams' full squads by
default** (`innings.battingIds ∪ innings.bowlingIds`), not just the bowling side — a
batting-team player can be tagged as a fielder (12th man, mixed/social games) without an
admin first adding them as a substitute purely to unlock the picker. `match.substitutes`
still folds in genuine bench players who aren't on either team's roster at all. The two
batters currently at the crease (`innings.onStrikeId`/`offStrikeId`) are always excluded —
they can't be the fielder credited on the same ball that dismisses/faces them.

`buildInningsFromBalls`, `computeNextBatsmen`, `battingForInnings`/`bowlingForInnings`,
`buildDismissalText`, `emptyBatterStats`/`emptyBowlerStats`, and the `InningsState`/
`BatterStats`/`BowlerStats` types now live in `services/inningsState.ts` — extracted from
LiveScoring so MatchScorecard's LIVE tab (below) can reconstruct the same crease state from
the same ball data. `ScoreHeader`/`BatterRow`/`BowlerRow`/`BallCircle` now live in
`components/LiveScoreboard.tsx` for the same reason; `BatterRow`'s `onToggleHand`/`onEdit`
props are optional (renders a plain, non-interactive hand chip and no ✎ button when
omitted) so the same component serves LiveScoring's editable rows and MatchScorecard's
read-only ones.

Back navigation (header back, Android hardware back, swipe gesture, and the abandon/delete
`goBack()` calls) is intercepted via a `beforeRemove` listener that resets straight to
Matches instead of popping through whatever setup stack (ScheduleMatch → TeamBuilder →
Toss) or "Edit Teams" detour got the scorer here. Requires a `redirectingToMatchesRef`
guard: calling `navigation.reset()` from inside `beforeRemove` removes the same screen,
which re-fires `beforeRemove` on it *before* the first `reset()` call returns — without the
guard that recurses forever (`RangeError: Maximum call stack size exceeded`). The guard
lets the second, self-triggered firing through instead of intercepting it again.

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

Text isn't stored — always re-derived from `ball.wagon.sector` + hand at render time. Hand
resolution for a wagon position name is `ball.wagon?.isLHB ?? (handOf(batsmanId) === 'LHB')`
— the snapshotted per-shot hand always wins over the player's current profile hand when
present (see `wagon.isLHB` above); only falls back to the profile for pre-existing balls
recorded before that field existed. This one `buildCommentary` call is shared by both
LiveScoring's live tab and MatchScorecard's completed-match tab, so fixing hand resolution
here fixes both without touching either screen.

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

Live matches additionally get a **LIVE** tab (shown first, auto-selected while
`currentMatch.status === 'live'` via a `showLiveTab` effect — falls back to SCORECARD once
the match finishes, without disturbing a tab the viewer picked manually) mirroring
LiveScoring's SCORING tab read-only: current striker/non-striker/bowler, "this over" ball
strip, chase target/RRR in the 2nd innings. Built from the same real-time `liveBalls` via
the shared `buildInningsFromBalls` (`inningsState.ts`) — no edit affordances (`BatterRow`'s
`onToggleHand`/`onEdit` omitted). Note: hand shown for wagon-position purposes here is the
player's profile `battingHand`, not the scorer's session-only `toggleHand()` override —
`buildInningsFromBalls` always returns `handedness: {}` since that override lives only in
LiveScoring's local component state and is never persisted, so a mid-innings hand
correction on the scorer's device won't be reflected on spectators' screens.

## Domain: player types
- ghost      — imported from PDF/CSV (or seeded), no auth. Also what a departed member becomes
  (see "Leave club / remove member" below) — distinguished by `status:'departed'`.
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

## Leave club / remove member (IMPLEMENTED)
A registered member can leave (self-service, `leaveClub` Cloud Function) or be removed by an
admin (`removeMember`) — both call a shared `deactivatePlayer` helper (functions repo):
`type:'registered'` → `type:'ghost'`, plus `status:'departed'` + `departedAt` timestamp.
**`careerStats` is never touched** — no subtraction, no deletion; the same doc (same id =
their uid) just goes dormant. `userMemberships/{uid}.clubIds` drops the clubId too.

- Both functions run inside a transaction with a **last-admin guard**: blocks if removing/
  leaving would drop the club to zero `type:'registered' && role:'admin'` players. This also
  closes a concurrent-race case (two admins leaving/removing each other simultaneously) —
  Firestore's transaction conflict detection forces a retry when the admin-count query's
  underlying docs changed since the read, so the second transaction sees the post-write count.
- **Rejoin (same uid) is automatic**: `resolveJoinRequest`'s approve path detects
  `existingPlayer.data().type === 'ghost'` at the requester's own doc (doc id is always their
  uid) and flips it straight back to `registered` — `status`/`departedAt` cleared via
  `FieldValue.delete()`, careerStats untouched, no `linkGhostId` needed or accepted (rejected
  with a clear error if one's passed alongside — merging the same doc into itself doesn't
  make sense and would double-write it in one transaction).
- **Squad/team-selection excludes departed; Leaderboard/stats does not.** `getClubPlayers`
  (`matchService.ts`) takes `{ includeDeparted?: boolean }` — default excludes (used by
  `ScheduleMatch`/`TeamBuilder`'s squad pickers); `Leaderboard`/`MatchScorecard`/`MatchStats`/
  `LiveScoring`/`AIAssistant` explicitly pass `includeDeparted: true` since a departed
  member's history must stay fully visible there. `getClubSquad` (Squad screen) and
  `getAvailablePlayers` (AI tool) hardcode the exclusion — no option, since they're always
  squad/team-selection contexts.
- **`getClubGhosts` excludes `status:'departed'`** — critical, not cosmetic: a departed
  member's doc is `type:'ghost'` like any other ghost, so without this exclusion an admin
  could pick a departed member from the "link to member" picker and merge them into someone
  ELSE, permanently corrupting stats and blocking their own reactivation (the self-reactivation
  path above only fires for an *unlinked* ghost sitting at the requester's own uid).
  `linkGhost.ts` rejects `status:'departed'` server-side too, as defense-in-depth.
- `firestore.rules`' `isMember(clubId)` requires `type == 'registered'` (not just doc
  existence) — since a departed member's doc is never deleted, existence-only would let them
  silently keep club read (and, via `isAdmin`, write) access forever.
- UI: `PlayerProfileView` — "Leave club" (self, `player.type==='registered'`) / "Remove from
  club" (admin viewing someone else, same condition), both behind an `Alert.alert` confirm.
  `RequesterProfile` shows a "Welcome back" banner when the requester's own doc is a departed
  ghost, confirming the reactivation is automatic (no ghost needs picking).

## Account deletion (IMPLEMENTED)
App Store Guideline 5.1.1(v): apps that support account creation must support in-app
account deletion. `authService.ts`'s `deleteAccount()` calls the `deleteAccount` Cloud
Function (functions repo), which ghosts the caller's player doc in every club they belong
to (same end state as leaveClub — careerStats untouched — see "Leave club / remove member"
above) and erases `users/{uid}`, `userMemberships/{uid}`, and the Firebase Auth user.
Blocked (whole thing aborts, nothing partially deleted) if the caller is the sole admin of
any one of their clubs — same last-admin guard as leaveClub/removeMember, surfaced as a
Cloud Function error naming the club.

Client-side ordering in `deleteAccount()`: unregisters the push token FIRST (it writes to
`users/{uid}`, which no longer exists once the callable returns), then calls the callable,
then signs out locally (Google + Firebase) — mirrors `signOut()`'s structure.

UI: `Profile/index.tsx`'s `DeleteAccountButton` (rendered in both branches — with and
without an active club), red outlined button below Sign Out, behind an `Alert.alert`
confirm, with a loading state and an error Alert on failure (e.g. the last-admin guard
tripping).

## Leaderboard (per-season stats)
Recomputed client-side from ball data (`services/seasonLeaderboard.ts`'s
`buildSeasonLeaderboard`) — **not** the all-time `careerStats` the backend writes. Only
`status === 'completed'` matches count; abandoned matches are excluded (mirrors the
backend: `onMatchCompleted`, the sole writer of `careerStats`/`playerPerformances`, never
fires for `'abandoned'` either, so an abandoned match never counted toward all-time stats
in the first place). `Leaderboard/index.tsx`'s `seasonsFrom` bucketing applies the same
exclusion, so a season with only abandoned matches doesn't appear as a selectable option.

Fielding tab intentionally displays/sorts by raw `catches + stumpings + runOuts` only —
`buildSeasonLeaderboard` still computes `score`/`eventPoints` (a weighted rating that
folds in negative-polarity fielding-event points, e.g. misfields) for other future
consumers (AI insights), but the Leaderboard screen hides that number since the rating
model isn't self-evident from a bare figure and negative-polarity events fan out to every
tagged fielder at full weight (one misfield with 2 fielders selected = two separate `-3`s,
not one) — easy to misread as "more bad plays happened than actually did."

Screen refetches on focus (`useFocusEffect`) rather than relying on a fresh mount, so e.g.
deleting a match on the Matches screen and returning here reflects it without a manual
pull-to-refresh.

## Match interest polls (IMPLEMENTED)
Admin gauges interest before scheduling: creates a poll (`CreateMatchPoll`), shares it via
the OS share sheet (WhatsApp is the real target), members respond in-app (`PollResponse`),
admin converts respondents into a scheduled match's pre-filled squad.

**Data model** (`clubs/{clubId}/matchPolls/{pollId}`):
```
question: string
multiSelect: boolean       — false: pick exactly one (simple yes/no poll). true: check any
                              number (multi-date poll) — no "Both"/"Neither" options exist,
                              multi-select already covers checking two boxes or none
options: PollOption[]      — { id, label, proposedDate?, schedulable, minResponses? }
                              schedulable drives the "Schedule this match" button (true for
                              "Yes"/every date row, false for "No"). minResponses is applied
                              uniformly to every schedulable option from one creation-form field.
venue?, note?: string
convertedMatches: { matchId, optionId, convertedAt }[]  — one entry per match created from
                              this poll; an option can be converted independently of others
createdAt, expiresAt: Timestamp  — expiresAt = one day after the max proposedDate across
                              options, computed once at creation
lastReminderCheckAt?: Timestamp  — sendPollReminders bookkeeping (functions repo)
optionThresholdMet?: Record<string, boolean>  — live on/off toggle per schedulable option,
                              driven by onPollResponseWritten (functions repo)
```
`clubs/{clubId}/matchPolls/{pollId}/responses/{uid}` — doc id = responder's uid (one per
member, re-tap overwrites): `{ uid, displayName, optionIds: string[], respondedAt }`.

**Screens**: `MatchPolls` (list, visible to all members not just admins — status chip shows
"Open"/"N of M scheduled"/"All scheduled"), `CreateMatchPoll` (two templates: "Simple
interest poll" builds Yes/No options sharing one date; "Multiple dates" builds one
schedulable option per admin-added candidate date), `PollResponse` (respond — tapping an
option saves immediately, no separate submit button; results — vote-share bar + expandable
"who voted" list per option, WhatsApp-poll style; admin — per-option "Schedule this match"
button once responses exist, "Delete Poll").

**Conversion**: "Schedule {option}'s match" builds a `MatchDraft` (squad = every respondent
whose `optionIds` includes that option; `rules`/`format` defaulted from `club.rules`) and
navigates `TeamBuilder({ clubId, matchDraft, pollId, pollOptionId })` — reuses the exact
draft-mode path `ScheduleMatch` already uses, no new match-creation code. `TeamBuilder`'s
existing draft-mode confirm handler, after `createMatch()` succeeds, best-effort
`markPollOptionConverted()`s if `pollId` is present — fire-and-forget, never blocks getting
to Toss.

**Sharing** (`matchPollService.ts`'s `sharePoll()`) — plain text+link, identical whether
it's `CreateMatchPoll`'s initial share right after creating a poll or `PollResponse`'s
"Share" button re-sharing later; deliberately **no snapshot image** (an earlier version
captured a branded `react-native-view-shot` card of live vote counts, same pattern as
`MatchScorecard`'s share — dropped: Android's `expo-sharing` API used for that image has no
caption/text parameter at all, so the image shared with no accompanying link, which defeated
the point of a poll people need to actually tap into). iOS passes `message`/`url` as
separate `Share.share()` items so WhatsApp shows clean caption text and unfurls the link
into its own preview card; Android has no separate `url` field in React Native's Share API
(a platform limitation, not routable around), so the link is appended into the message text
there. Poll IDs are a short custom 8-char id (`generateShortPollId()`), not Firestore's
~20-char auto-id — kept short because it ends up visible in the shared link text.

**Deep linking**: shared links are `https://crease-24487.web.app/poll/{clubId}/{pollId}`
(Universal Links/iOS, App Links/Android — `app.json`'s `associatedDomains`/`intentFilters`)
with a `cricket-scorer-app://poll/{clubId}/{pollId}` custom-scheme fallback. Deliberately
**not** wired through React Navigation's `linking` prop — `RootNavigator` only registers its
full screen set once signed in (see "Tap-to-navigate" under Push notifications below), which
would silently drop a `linking`-driven navigation arriving while signed out. Routed through
the same `pendingNotificationStore` queue as notification taps instead (`App.tsx`'s
`Linking.addEventListener('url', ...)` + `Linking.getInitialURL()` → `handleDeepLinkUrl()` in
`notificationNavigation.ts`), so it replays once auth resolves. `PollResponse` itself handles
the "signed in but not a club member" state (poll doc is readable by any signed-in user, same
precedent as the `clubs/{clubId}` doc rule, so the question shows before prompting to join).

**Reminders & Game's on/off**: `minResponses` on a schedulable option, set once at creation,
drives two Cloud Functions in the functions repo — `sendPollReminders` (4-hourly nudge to
non-responders, stops per-option once resolved) and `onPollResponseWritten` (live on/off
toggle per option, broadcasts "Game's on!"/"Game's off!" to the whole club on each crossing,
can fire more than once if responses fluctuate). See functions repo CLAUDE.md for the logic.

**Expiry & cleanup**: `MatchPolls` list filters out expired polls client-side
(`getClubPolls`); the `cleanupExpiredPolls` scheduled Cloud Function (functions repo)
permanently deletes them a day after their last candidate date. Admin can also delete a poll
manually any time (`deletePoll` — clears the `responses` subcollection first, Firestore
doesn't cascade-delete).

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
- `onMemberPromotedToAdmin` — sends a fun "you're an admin now" push when a player's role
  transitions to 'admin' (update only — the club creator's initial admin role at creation
  doesn't count as a promotion)
- `onMatchLive` — notifies registered members (minus the scorer) when a match goes live
- `onMatchAbandoned` — notifies registered members (minus the scorer) when a match is
  abandoned (kept separate from `onMatchCompleted`, whose guard never fires for 'abandoned')
- `linkGhost` / `unlinkGhost` — admin callable stat merge/reversal
- AI callables: `getAvailablePlayers`, `getPlayerStats`, `getPlayerForm`,
  `getBattingInsights`, `getBowlingInsights`, `getHeadToHead`, `getMatchContext`
- `onPollCreated` — notifies registered members (minus the creator) of a new match poll
- `onPollResponseWritten` — flips `optionThresholdMet` and sends "Game's on!"/"Game's off!"
  when a schedulable option's `minResponses` is crossed (see "Match interest polls" above)
- `sendPollReminders` — every 4h, nudges non-responders on still-open polls
- `cleanupExpiredPolls` — every 24h, deletes polls a day past their last candidate date
- `pollLandingPage` — HTTPS function behind the `crease-24487.web.app/poll/**` Hosting
  rewrite; branded static Open Graph card + redirect to the app for shared poll links

Deploy: `firebase deploy --only functions` from `functions/` subdirectory. Also
`firebase deploy --only hosting` if `firebase.json`/`public/` changed (this repo now has a
Hosting site backing `pollLandingPage` and the Universal/App Links `.well-known` files — see
functions repo CLAUDE.md).

## Push notifications
**Delivery needs `eas credentials` run once, as of 2026-07-11 — until then, do not assume
this delivers.** Tokens register fine (`getExpoPushTokenAsync` succeeds, `users/{uid}.
expoPushTokens` gets populated) but Expo's push relay silently can't actually deliver until
push credentials (an APNs key for iOS, an FCM service-account key for Android) are
registered against this app on Expo's servers — that's a one-time `eas credentials` run
(narrow credential registration, not EAS Build — see the rule above). No code changes
needed for this; it's an account/credentials setup step only.

Expo push notifications (`expo-notifications` client-side, `expo-server-sdk` v5 — pinned
below v6 because v6+ is ESM-only and the functions repo compiles to CommonJS). Triggers: new
join request → club admins; join request approved → the requester; promoted to admin → that
player (fun copy, taps through to EditClub); match goes live → registered members minus the
scorer; match finishes (completed or abandoned) → registered members minus the scorer; new
match poll / poll reminder / "Game's on!" / "Game's off!" → registered members (see "Match
interest polls" above). Match- and poll-related sends respect the per-user opt-out
(`users/{uid}.notificationPrefs.matchNotifications`, default on, toggled in Profile —
poll sends go through `notifyRegisteredMembers`, which hardcodes this) — join-request/
approval/made-admin notifications always send regardless.

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
"auth resolves" or "nav becomes ready" can be the one that happens second. Shared match-poll
deep links (`https://crease-24487.web.app/poll/...` / `cricket-scorer-app://poll/...`) go
through this exact same queue via `handleDeepLinkUrl()` — deliberately not React Navigation's
`linking` prop, for the same "RootNavigator only registers its full screen set once signed
in" reason. See "Match interest polls" above.

Push delivery cannot be exercised in the iOS Simulator at all, and needs a native rebuild
(`expo-notifications` bundles native code) plus, for iOS, a one-time APNs key via
`eas credentials`.

## AI tools — DATA ONLY, no reasoning in tools
Tools return structured JSON. LLM does all reasoning.
Returns JSON teams + rationale → app parses → `createMatchTeams` Function persists.

## Sign-in providers
`SignIn/index.tsx` offers Google (all platforms) and Apple (iOS only — required alongside
Google by App Store Guideline 4.8; the native module has nothing to offer on Android
anyway). The Apple button is additionally gated by `AppleAuthentication.isAvailableAsync()`
at runtime (checked in a mount effect) — `Platform.OS === 'ios'` alone isn't enough, since
that's also false on a device signed out of iCloud/without an Apple ID.

`authService.ts`'s `signInWithAppleCredential(identityToken, rawNonce, fullName)`:
- Nonce: a random hex string is hashed (SHA-256, `expo-crypto`) and passed to
  `AppleAuthentication.signInAsync`; the RAW nonce goes to Firebase's
  `OAuthProvider('apple.com').credential()` — standard replay-protection handshake.
- Apple's identityToken JWT already carries the email claim (Firebase auto-populates
  `user.email` from it, same as Google's ID token) — but NOT a name claim. `fullName` is
  only returned by Apple out-of-band on-device, and only on the very first-ever
  authorization for this app (never again, even after reinstall, unless the user revokes
  and re-grants access in Settings). `signInWithAppleCredential` writes `displayName` to
  both the Firebase Auth profile (`updateProfile`) and `users/{uid}` (`setDoc merge:true`)
  directly — NOT left to `initializeUserDocs`' create-only-if-missing check, since that
  runs from a separate `onAuthStateChanged` listener that races this function; whichever
  finishes first must not leave the doc with a blank name.

`app.json` plugins include `expo-apple-authentication`, whose config plugin injects the
`com.apple.developer.applesignin` entitlement into `ios/Crease/Crease.entitlements` at
`expo prebuild` time (run by `build-ios.sh` on every build — `ios/` is gitignored and fully
regenerated, so this entitlement must come from the plugin, never hand-edited).

## Auth
Firebase ID token via `getAuth().currentUser.getIdToken(false)`
API key from `Constants.expoConfig.extra.apiKey` (injected via EAS Secrets)
Never store tokens to disk. Never commit .env

## Wagon wheel orientation
Two selectable views, `src/store/wagonViewStore.ts` (`bowlerView: boolean`, session-only,
**defaults to `true`** — bowler's-end view is the default, not keeper's/batsman's-end).
Toggle pill lives inside `WagonWheelModal` itself.
- **Bowler's view** (default): looking from the bowler's end toward the batsman — batsman at
  TOP.
- **Batsman's/keeper's view**: batsman at BOTTOM, bowler at TOP (both look the same direction,
  toward the bowler).

The two views are a straight 180° rotation of each other (`angleOffset = bowlerView ? 180 :
0`), applied identically to both `tapToSel`'s tap→sector angle math and the label-placement
angle math in `WagonWheelModal` — sector 0 ("Straight", toward the bowler) sits at the TOP in
batsman's view, BOTTOM in bowler's view. This rotation is also *why* off side / leg side
swap screen-left/right between the two views: `offSideRight = isLHB === bowlerView`, shown
explicitly as "OFF SIDE"/"LEG SIDE" captions above the wheel (computed once per render, not
per-sector).

`sector` (0–11, 30° each, clockwise from 0=straight) is **pure geometry, hand-independent** —
a tap at the same screen position always yields the same sector regardless of who's batting.
Only the sector→label translation depends on hand: RHB off side = RIGHT / leg side = LEFT in
batsman's view (`RHB_WAGON_LABELS`); LHB mirrors it (`LHB_WAGON_LABELS`), same 12 geometric
slots, different names attached to each. The hand used for this on the wheel is
`innings.handedness[onStrikeId]` — session-only, seeded from the player's profile
`battingHand` but independently flippable per-innings via `toggleHand()` — see `wagon.isLHB`
above for why that matters beyond just this screen's rendering.

Interaction: press-and-drag to highlight a sector/depth live (ring + label + dot marker all
track the touch), release to commit and close — no Confirm button. A small "Skip" text link
(top-right of the modal) is the only way to record no shot.

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
- C7: Abandoned match excluded from prevMatch and from Leaderboard season stats
- C2/C3/C4/C5/M4: Linked ghost excluded from all squad reuse paths
- G4: BowlerRow economy uses match ballsPerOver, not hardcoded 6
- J5: sealedRef guard prevents double match completion

Emulator tap coordinate note: device is 2560×1600; screencap displayed at 2000×1250 in
viewer — multiply displayed coords by 1.28 to get device tap coordinates.
