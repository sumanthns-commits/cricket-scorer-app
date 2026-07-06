# Voice-Over Live Scoring — Grammar Spec

## Status
Design spec only — not yet implemented. No `voice/` module exists yet.

## Concept
Scorer speaks ball-by-ball commentary in a fixed, constrained format; the app
parses it deterministically (no LLM in the write path) into the same `BallDoc`
shape that manual button entry produces, and calls the same `commitBall()` /
`deleteLastBall()` functions LiveScoring already uses. Voice is an alternate
*producer* of ball events, not a parallel scoring engine.

## Why deterministic parsing, not an LLM
- `scoringEngine.ts` is a deterministic pure function today; the app's only
  LLM usage (`src/ai/`, Gemini 2.5 flash) is reserved for the assistant
  (team selection, insights) — never in the live-scoring write path.
- Offline-safe: grounds have poor connectivity; a local grammar parser needs
  nothing but the ASR transcript.
- Instant: no network round-trip per ball.
- Free at volume: hundreds of balls/match, a season of matches.
- Deterministic & testable: same unit-test discipline as `scoringEngine.ts` /
  `commentary.ts` — this is effectively the inverse of `buildCommentary`
  (structured → text), so it reuses the same closed vocabularies (wagon
  labels, extras types, `customDismissals`) instead of inventing new ones.

## Two trigger modes, one grammar

```
hands-free:    "start crease" <command> "end crease"
push-to-talk:  <button-down> <command> <button-up>
```

Push-to-talk never needs the wake phrases — the button press/release already
bounds the utterance. Both modes feed the same `<command>` grammar below.
Push-to-talk is the recommended path to ship and validate first; hands-free
is a mode layered on top for when the scorer is also fielding/batting.

### Hands-free wake-word FSM

```
IDLE  --"start crease"-->  CAPTURING  --"end crease"-->  PARSE(buffer) --> IDLE
```

- A lightweight always-on keyword spotter (not full ASR) listens only for
  `start crease` / `end crease`. Full ASR only runs during `CAPTURING`.
- `start crease` → confirmation tone (audio, not visual — no screen glance
  available), begin transcribing into a buffer.
- `end crease` → second, distinct tone, strip both wake tokens, parse buffer,
  return to `IDLE`.
- **Safety cutoff**: max duration (~8s) or silence timeout (~2.5s), whichever
  first, in case `end crease` is missed — otherwise unrelated speech after a
  missed end-phrase gets swallowed into the same transcript.
- **Re-trigger while `CAPTURING`**: `start crease` heard again resets the
  buffer (scorer misspoke, wants to redo) rather than nesting.
- Wake phrase is fixed, not club-configurable — needs to stay a stable,
  low-false-positive bigram; unlike dismissal types, tuning this per club
  would reintroduce the fragility it's meant to avoid.

### Platform note (hands-free only)
True hands-free (phone not in hand) requires the mic to keep listening while
the scorer isn't touching the app. On iOS this needs the `UIBackgroundModes:
audio` entitlement (same mechanism voice-recorder/walkie-talkie apps use) —
doable, not blocked, but a real capability to add, with a persistent
listening indicator for transparency. Pair with a Bluetooth earbud mic
(travels with the scorer, streams over Bluetooth regardless of where the
phone physically sits) rather than relying on the phone's built-in mic,
which won't reliably hear a fielding player from a stand on the boundary.

## Intent dispatch

First token(s) of `<command>` route to one of five intents. Anything else
falls through to `BALL_EVENT` — the default, since plain commentary needs no
leading keyword.

| Intent | Leading pattern | Mutates state? | Maps to |
|---|---|---|---|
| `BALL_EVENT` | `<bowler> to <batsman> ...` | yes | `commitBall()` |
| `UNDO` | `"undo"` / `"scratch that"` | yes | `deleteLastBall()` |
| `SELECT_BOWLER` | `"bowler" <name>` / `<name> "to bowl"` | yes (ephemeral, per over) | bowler-selection state |
| `SELECT_BATSMAN` | `"batsman" <name>` / `"new batsman" <name>` | yes | `nextBatsmanId` / opening-batsmen flow |
| `QUERY_*` | `"score"`, `"who's on strike"`, `"who's bowling"`, `"overs left"`, `"run rate"` | **no** | read reconstructed innings state, speak back via TTS |

`QUERY_*` is strictly read-only — mirrors the "tools return data, no reasoning
in the write path" separation already used for AI tools. A misheard query
can never corrupt the scorecard.

`SELECT_BOWLER` / `SELECT_BATSMAN` name resolution must validate role/team
membership, not just fuzzy-match the string — e.g. "bowler kumar" resolving
to a name on the batting side should be rejected with a spoken "Kumar isn't
in the fielding side," not silently accepted. Fuzzy match scoped to the
current XI only (same approach as `fuzzyMatcher.ts`, not the whole club).

## `<ball-body>` grammar

```
<ball-body>     ::= <runs-clause> | <extras-clause> | <wicket-clause>

<runs-clause>   ::= ("dot"|"one"|"two"|"three"|"four"|"five"|"six") ["to" <wagon-pos>]

<extras-clause> ::= "wide" [<n> "runs"]                    -- default 1
                   | "no ball" ["and" <n>]                  -- default 1 penalty, +n off bat
                   | ("bye"|"leg bye") <n> "runs"            -- n required, 1-6 (per F16)

<wicket-clause> ::= ("wicket"|"out") [<dismissal-type>] ["by" <fielder-name>]
                     [<name> "is out"] [<n> "run(s) completed"]

<dismissal-type>::= "bowled" | "caught" | "lbw" | "run out" | "stumped"
                     | <club-custom-type>
```

- `<wagon-pos>` reverse-matches the exact strings in `RHB_WAGON_LABELS` /
  `LHB_WAGON_LABELS` (`src/constants/wagonPositions.ts`) — the same table
  `Commentary` renders from — fuzzy-matched.
- `<dismissal-type>` is seeded from the match's `dismissalConfig` /
  `customDismissals` at parse time, not hardcoded — the scoring engine is
  only ever aware of that config.
- `<fielder-name>` required for caught/stumped/run-out, meaningless for
  bowled/lbw.

## Slot-filling policy: ask only for what's missing

No blanket "confirm?" gate. If every required slot for the parsed event is
present in the utterance, auto-commit immediately (with a spoken echo, no
question). If a required slot is missing, ask **only** for that slot, one at
a time, and nothing else.

| Dismissal | Required to auto-commit (no question asked) | Optional (never asked, omitted if absent) |
|---|---|---|
| `bowled` | — (striker is unambiguous; keyword alone is enough) | — |
| `lbw` | — (same) | — |
| `caught` | fielder | — |
| `stumped` | fielder (skip if match has one designated keeper — infer it) | — |
| `run out` | **who's out** (striker/non-striker — genuinely ambiguous, not inferable), **completed runs** (drives the crease-crossing / strike-rotation logic) | fielder(s) — commit without fielding credit if unsaid; addable later via the existing UI |
| custom (club-defined) | whatever fields that dismissal's config marks required | rest |

`run out` is the one type where "who's out" can never be inferred — unlike
`bowled`/`lbw` where only the facing striker is possible.

### Follow-up mechanic
- One missing slot at a time, in order, not a combined multi-part question —
  keeps each reply short and easy to parse reliably.
- A follow-up reply needs **no wake phrase** — the app just asked a
  question, so it's already in a listening sub-state expecting exactly one
  answer. Wake words are only for scorer-*initiated* capture.
- If an answer fails to parse twice in a row, stop asking and fall back to
  the existing manual WicketSheet UI for the scorer to finish by touch —
  graceful degradation instead of an infinite voice loop.

## Worked examples

```
"start crease, anand to hegde, one, to point, end crease"
  → BALL_EVENT  bowler=Anand batsman=Hegde runs=1 wagon=point
  → all required slots present → auto-commit + echo, no question

"start crease, wide, end crease"
  → BALL_EVENT  extras=wide runs=1

"start crease, no ball and two, end crease"
  → BALL_EVENT  extras=no-ball penaltyRuns=1 batRuns=2

"start crease, anand to hegde, out, end crease"
  → dismissal type missing → ask "Wicket type?" → "run out"
  → who's-out missing → ask "Who's out?" → "Hegde"
  → runs-completed missing → ask "Runs completed?" → "0"
  → fielder not asked (optional) → commit

"start crease, anand to hegde, run out, hegde is out, 1 run completed, end crease"
  → type=run-out, who's-out=Hegde, runs=1 all present in the original utterance
  → every required slot already filled → auto-commit immediately, no questions
  → spoken echo: "run out, Hegde, one run completed"

"start crease, bowler kumar, end crease"
  → SELECT_BOWLER name=Kumar (validated against fielding XI)

"start crease, new batsman sharma, end crease"
  → SELECT_BATSMAN name=Sharma

"start crease, score, end crease"   (or push-to-talk: hold, "score", release)
  → QUERY_SCORE → TTS: "87 for 3, after 12.4 overs"

"start crease, who's bowling, end crease"
  → QUERY_STATE → TTS: "Kumar, 3 overs, 1 for 18"

"start crease, undo, end crease"
  → UNDO
```

## Open items / next design step
- `voice/` module shape: wake-word listener, intent dispatcher, per-intent
  slot parsers, follow-up sub-dialog state machine — not yet scaffolded.
- Exact ASR engine choice (on-device vs. platform STT) not yet decided.
- MVP sequencing: push-to-talk + runs/extras first, wickets and hands-free
  mode layered in after grammar/ASR accuracy is validated against real
  matches.
