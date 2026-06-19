# Cricket Scorer — Mobile App

## What this is
React Native + Expo app for local cricket clubs.
Live scoring, player management, stats tracking, AI team selection.

## Stack
- React Native, Expo SDK managed workflow, TypeScript strict
- Firebase JS SDK v10 modular imports only
- React Navigation v6 (bottom tabs + native stack)
- Zustand for local state, React Query for server state
- Firebase AI SDK (`firebase/ai`, VertexAIBackend) with Gemini (gemini-2.5-flash) for AI assistant

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
- All colours in artifacts/components use inline style={{}} with explicit hex values
  — no Tailwind colour classes with arbitrary values like bg-[#1e293b]

## Domain: player types
- ghost      — imported from PDF/CSV (or seeded), no auth
- registered — has Firebase auth, a club member
- linked     — a ghost an admin merged into a registered member (see Ghost
               linking); stats folded into the member, hidden from selection

## Authoritative player model
Players are subcollection docs `clubs/{clubId}/players/{playerId}` (ghost id =
arbitrary, registered/linked id = uid), with `type`, `role`, `careerStats`.
A LEGACY top-level `players` collection still backs onStatsImport + fuzzyMatcher;
it is otherwise unused. Build new code against the subcollection.

## Domain: ghost linking (IMPLEMENTED)
An admin links an existing ghost to a new member when approving their join
request — `resolveJoinRequest({ ..., linkGhostId })`, Admin SDK:
- DIRECT per-club merge: `addCareerStats` folds the ghost's careerStats into the
  member's `clubs/{clubId}/players/{uid}.careerStats`. No cooldown.
- ghost doc → `type:'linked'`, `linkedTo: uid` (its frozen stats ARE the reversal
  snapshot); member gets a `linkedGhost { ghostId, displayName, linkedAt }` pointer.
- Reversible: `unlinkGhost` subtracts the ghost's frozen stats back out and
  restores `type:'ghost'`.
- Suppression: `type:'linked'` is filtered from team selection (getClubPlayers),
  squad (getClubSquad), and AI selection (getAvailablePlayers).
- Global/cross-club stats need no special handling — the `publicPlayerStats`
  mirror (per `uid_clubId`, kept in sync by the `mirrorPlayerStats` trigger)
  reflects the merged per-club totals automatically.

## Self-service claim lifecycle (PLANNED — NOT implemented)
The cooldown/contest/auto-merge flow below is a design target only. No code
creates or merges claims today; `statsResolver` merely PREVIEWS a claim's
snapshot if one existed. Ghost→member linking currently happens ONLY via the
admin path above.
open → cooldown → merged          (intended: auto via Cloud Task at mergeScheduledAt)
cooldown → contested              (2nd player claims same ghost during cooldown)
contested → admin resolves        (picks winner, rejects loser)
merged → reverted                 (snapshot arithmetic reverses the merge)

## Stats resolver rule
resolvePlayerStats() / resolveSquadStats() preview a ghost's pending claim
(dormant until the claim flow above is built):
- ghost stats: from claim.snapshot.ghostStats; registered stats: live from doc
- dedup: suppress a ghost from a squad if its claimant is also in the squad

## Scoring engine rule
scoringEngine.ts only needs dismissalConfig (built by screen from match.rules).
Engine is NOT aware of other rules — UI handles which buttons to show.
customDismissals in ClubRules is the only engine-aware config.

## AI tools — DATA ONLY, no reasoning in tools
Tools: get_available_players, get_player_stats, get_player_form,
       get_batting_insights, get_bowling_insights, get_head_to_head, get_match_context
LLM does all reasoning. Returns structured JSON teams + rationale.
App parses JSON, calls createMatchTeams Firebase Function to persist.

## Auth
Firebase ID token via getAuth().currentUser.getIdToken(false)
API key from Constants.expoConfig.extra.apiKey (injected via EAS Secrets)
Never store tokens to disk. Never commit .env

## Wagon wheel orientation
Keeper's view (behind the batsman). Batsman at BOTTOM, bowler at TOP.
0° = top (straight/toward bowler), clockwise positive.
RHB: off side = RIGHT, leg side = LEFT.
LHB: labels flip, geometry stays same.
12 uniform 30° sectors, 2° gap between each.

## Env vars (in .env, gitignored)
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_MCP_URL
API_KEY
EXPO_PUBLIC_USE_EMULATOR=true for local dev
