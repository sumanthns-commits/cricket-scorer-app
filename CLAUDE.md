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

- **ScheduleMatch**: creates match doc, selects squad. "Reuse previous squad & teams"
  carries over teamA, teamB, captainA, captainB (if those players are in the new squad).
  Uses `navigation.navigate` (not replace) so back returns to the form.
- **TeamBuilder**: assigns squad players to Team A/B, sets captains, optional AI balance.
  Uses `navigation.navigate` to Toss. Accepts `returnTo?: 'LiveScoring'` param — when
  set (editing teams before first ball from live screen), replaces back to LiveScoring.
- **Toss**: coin flip, toss winner + choice (bat/field), select scorer. Sets match status → 'live'.
- **LiveScoring**: loads match state, reconstructs innings from saved overs.

## Match data model (`clubs/{clubId}/matches/{matchId}`)
```
status: 'scheduled' | 'live' | 'completed' | 'abandoned'
squad: string[]        — all selected player IDs
teamA: string[]        — Team A player IDs
teamB: string[]        — Team B player IDs
captainA?: string      — captain ID for Team A
captainB?: string      — captain ID for Team B
substitutes?: string[] — mid-match substitute player IDs (arrayUnion/arrayRemove)
toss?: MatchToss       — winner, choice (bat/field), scorerId
rules: ClubRules       — snapshot at schedule time (live rules come from club doc)
inningsSummary?        — written by onMatchCompleted Cloud Function
```
Overs subcollection: `matches/{matchId}/overs/{overId}` — each doc has `balls: BallEntry[]`.

## BallEntry fielding
```
fielding?: {
  eventId?: string
  eventLabel?: string   — snapshot label (survives rule edits)
  fielderId?: string    — legacy single fielder
  fielderIds?: string[] — multi-select (new); fanout to all selected fielders
}
```
The Cloud Function `onMatchCompleted` handles both `fielderId` and `fielderIds`.
Client-side `seasonLeaderboard.ts` also fans out via `fielderIds ?? [fielderId]`.

## Live scoring screen tabs
SCORING | SCORECARD | TEAMS | STATS

- **SCORING**: ball-by-ball entry, wagon wheel, fielding overlay, wicket sheet
- **SCORECARD**: batting + bowling tables, innings switcher in 2nd innings
- **TEAMS**: shows Team A/B rosters with captain badge (C); substitutes section
  with add/remove (admin only). "Edit Teams" button shown before first ball.
  Substitutes from any team/player pool can be added; they appear in fielding overlay.
- **STATS**: MatchStatsContent component (worm, wagon wheel, per-over stats)

Fielding overlay: multi-select vertical checklist (scrollable, maxHeight 160).
Panel auto-dismisses after 6 s of inactivity. Selected fielder(s) shown in summary line.

## Domain: player types
- ghost      — imported from PDF/CSV (or seeded), no auth
- registered — has Firebase auth, a club member
- linked     — ghost merged into a registered member; stats folded in, hidden from selection

## Authoritative player model
Players: `clubs/{clubId}/players/{playerId}` with `type`, `role`, `careerStats`.
LEGACY top-level `players` collection backs onStatsImport + fuzzyMatcher only — unused elsewhere.
Build new code against the subcollection.

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
- `onMatchCompleted` — aggregates career stats, fielding points, wagon wheel from overs
- `mirrorPlayerStats` — syncs publicPlayerStats after per-club player writes
- `resolveJoinRequest` — ghost linking / join approval
- `linkGhost` / `unlinkGhost` — admin callable stat merge/reversal
- AI callables: `getAvailablePlayers`, `getPlayerStats`, `getPlayerForm`,
  `getBattingInsights`, `getBowlingInsights`, `getHeadToHead`, `getMatchContext`

Deploy: `firebase deploy --only functions` from `functions/` subdirectory.

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
