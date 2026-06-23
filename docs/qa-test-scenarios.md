# Cricket Scorer — QA Test Scenarios

Full regression suite for the cricket scorer app. Run via the `cricket-app-qa-tester` agent (see CLAUDE.md).

---

## A. App Launch & Navigation

| ID | Scenario | Expected |
|----|----------|----------|
| A1 | Cold launch the app | No crash, lands on Home or Matches tab |
| A2 | Sign-in screen renders | Email/password fields present |
| A3 | Authenticated user sees bottom tabs | Home, Matches, Squad, Assistant, Profile |

---

## B. Squad Management

| ID | Scenario | Expected |
|----|----------|----------|
| B1 | Squad tab shows all players | Ghost (purple dot), registered (green dot), linked (blue dot) all visible |
| B2 | `type:'linked'` players DO appear in Squad tab | Squad screen shows all types including linked |
| B3 | Admin taps + button | "Add Ghost Player" sheet opens |
| B4 | Create ghost player with name only | Player appears in squad list immediately |
| B5 | Create ghost player with batting hand, bowling style, keeping ability | Player metadata saved correctly |

---

## C. Match Scheduling (ScheduleMatch → TeamBuilder → Toss)

| ID | Scenario | Expected |
|----|----------|----------|
| C1 | Tap + Schedule → "Fresh squad" | Player picker opens, no pre-selection |
| C2 | Player picker excludes `type:'linked'` players | Linked players are NOT selectable in squad picker |
| C3 | "Previous squad" reuse mode | Players from most recent COMPLETED match pre-selected; linked players excluded |
| C4 | "Same teams (edit)" reuse mode | TeamBuilder opens pre-populated with previous teams; linked players purged from both teams |
| C5 | "Quick rematch" reuse mode | Goes straight to Toss with same home/away teams; linked players purged from squad/teams |
| C6 | Quick rematch only offered when prevMatch is 'completed' | If last match was abandoned or live, Quick rematch still available from most recent completed match |
| C7 | ABANDONED match is excluded from prevMatch | Abandoned match is not used as the "previous match" for reuse modes |
| C8 | LIVE match is excluded from prevMatch | In-progress match is not used as prevMatch |
| C9 | Captain carried over from previous match | Captain pre-selected in TeamBuilder only if still in active (non-linked) player set |
| C10 | Captain from previous match was since linked to a ghost | Carried-over captain slot is cleared (not shown as invalid) |

---

## D. TeamBuilder

| ID | Scenario | Expected |
|----|----------|----------|
| D1 | Assign players to Team A and Team B | Drag or toggle assigns correctly |
| D2 | Set captain for Team A | Captain shows "C" badge |
| D3 | Set captain for Team B | Captain shows "C" badge |
| D4 | AI Balance button | Teams get auto-assigned; button disabled while loading |
| D5 | Cannot proceed without minimum players on each side | Validation error shown |
| D6 | `returnTo: 'LiveScoring'` param | After saving from live screen edit, navigates back to LiveScoring |

---

## E. Toss

| ID | Scenario | Expected |
|----|----------|----------|
| E1 | Coin flip animation plays | Heads/tails result displayed |
| E2 | Toss winner selected (home/away) | Winner name shown |
| E3 | Choice (bat/field) recorded | Match transitions to status='live' |
| E4 | Toss winner display order | Toss winner listed first in the header |

---

## F. Live Scoring — SCORING Tab

### Basics
| ID | Scenario | Expected |
|----|----------|----------|
| F1 | Score dot ball (0) | Ball track shows `•`, score unchanged |
| F2 | Score 1 run | Score +1, strike rotates to off-striker |
| F3 | Score 2 runs | Score +2, strike does NOT rotate (even) |
| F4 | Score 4 (boundary) | Score +4, four badge shown in ball track |
| F5 | Score 6 (six) | Score +6, six badge shown in ball track |
| F6 | Undo last ball | Score and batter stats revert to previous state |

### Wides
| ID | Scenario | Expected |
|----|----------|----------|
| F7 | Wide +0 (plain wide) | Extras +1, score +1, **strike does NOT rotate**, delivery NOT counted in over |
| F8 | Wide +1 (batsmen ran 1) | Extras +2, score +2, **strike DOES rotate**, delivery NOT counted in over |
| F9 | Wide +2 (batsmen ran 2) | Extras +3, score +3, strike does NOT rotate (physicalRuns=2, even) |
| F10 | Wide modal shows +0 through +6 options | 7 buttons shown (+0, +1, +2, +3, +4, +5, +6) |

### No-balls
| ID | Scenario | Expected |
|----|----------|----------|
| F11 | No-ball +0 | Extras +1, score +1, strike does NOT rotate, delivery NOT counted |
| F12 | No-ball +1 | Extras +2, score +2, **strike DOES rotate**, delivery NOT counted |
| F13 | No-ball + 4 (bat boundary off NB) | Extras +1 (NB penalty), runs +4 (to batter), total +5, strike does NOT rotate (physicalRuns=4, even) |

### Byes / Leg Byes
| ID | Scenario | Expected |
|----|----------|----------|
| F14 | Bye 1 run | Extras (bye) +1, score +1, **bowler runs NOT inflated** |
| F15 | Leg-bye 3 runs | Extras (lb) +3, score +3, bowler runs NOT inflated |
| F16 | Bye/LB run picker shows 1–6 | Options are [1, 2, 3, 4, 5, 6] (not capped at 4) |

### Wickets
| ID | Scenario | Expected |
|----|----------|----------|
| F17 | Wicket → Caught | Fielder picker shown; dismissal recorded; new batter prompted |
| F18 | Wicket → Bowled | Dismissal recorded; bowler gets wicket credit; new batter prompted |
| F19 | Wicket → LBW | Dismissal recorded; bowler gets wicket credit |
| F20 | Wicket → Run Out (on-striker dismissed) | "WHO WAS RUN OUT?" toggle shows both batters; on-striker highlighted by default; on-striker dismissed, new batter replaces them |
| F21 | Wicket → Run Out (non-striker selected) | Non-striker card highlighted as "dismissed"; on-striker card shows "on strike"; non-striker gets dismissed, on-striker keeps all batting credit for that ball |
| F22 | Wicket → Stumped | Keeper credited; bowler does NOT get wicket (stumped ≠ bowler wicket in rules) |
| F23 | Wicket → Hit Wicket | Bowler gets wicket credit |
| F24 | Wide + Run-out | Run-out on a wide delivery supported via "Run-out?" button in wide modal |

### End-of-over
| ID | Scenario | Expected |
|----|----------|----------|
| F25 | Over completes (legal balls = ballsPerOver) | New bowler picker appears; strike rotates if autoRotateStrikeEoO=true |
| F26 | maxBowlerOvers enforced | Bowler at over cap is NOT shown in the new bowler picker |
| F27 | Last ball of over is a wide | Wide does not count as legal ball; over not closed |

---

## G. Live Scoring — SCORECARD Tab

| ID | Scenario | Expected |
|----|----------|----------|
| G1 | Batting table shows current batters | Runs, balls, 4s, 6s, SR columns correct |
| G2 | Dismissed batter shown with dismissal text | e.g. "c Sam Pillai b Jones" |
| G3 | Bowling table: runs conceded excludes byes/LB | If 3 byes occurred, bowler's R column does not include those 3 |
| G4 | Economy formula uses match's ballsPerOver | If ballsPerOver=5: econ = runs ÷ (legalBalls/5), not ÷ (legalBalls/6) |
| G5 | Innings switcher appears in 2nd innings | Dropdown or toggle to switch between Innings 1 and 2 |

---

## H. Live Scoring — TEAMS Tab

| ID | Scenario | Expected |
|----|----------|----------|
| H1 | Team A roster shown with player names | All Team A players listed |
| H2 | Team B roster shown with player names | All Team B players listed |
| H3 | Captain shown with "C" badge | If captainA/captainB set, badge appears next to name |
| H4 | SUBSTITUTES section visible | "No substitutes added" or sub list shown |
| H5 | Admin can add substitute | Substitute appears in sub list and in fielding overlay |
| H6 | "Edit Teams" button visible before first ball | Button present when over count = 0 |
| H7 | "Edit Teams" not shown after first ball | Button hidden once scoring has started |

---

## I. Live Scoring — STATS Tab

| ID | Scenario | Expected |
|----|----------|----------|
| I1 | Worm chart renders | Ascending line graph of cumulative runs per ball |
| I2 | Runs per over bar chart renders | Bar for each completed over |
| I3 | Wagon wheel renders after balls with wagon data | Circular chart with shot direction sectors |
| I4 | Wagon wheel: Batsman/Bowler toggle | Switch changes perspective |
| I5 | Wagon wheel: player dropdown | Selecting a different batter updates the wheel |

---

## J. Match Completion

| ID | Scenario | Expected |
|----|----------|----------|
| J1 | All wickets fall (all out) | Innings-complete screen shown with total score |
| J2 | Overs complete | Innings-complete screen shown |
| J3 | 2nd innings: target reached | Match complete screen with "Team X won by Y wickets" result |
| J4 | 2nd innings: batting team all out below target | Match complete with "Team X won by Y runs" result |
| J5 | Match already completed (sealedRef guard) | Tapping "complete" a second time does not duplicate stats write |
| J6 | Abandon match | Match status → 'abandoned'; excluded from future prevMatch |

---

## K. Fielding Events & Overlay

| ID | Scenario | Expected |
|----|----------|----------|
| K1 | Fielding overlay opens after a scoring ball | Panel appears with fielder checklist |
| K2 | Multi-select fielders | Multiple fielders selectable; all credited |
| K3 | Panel auto-dismisses after 6s inactivity | Overlay disappears without any tap |
| K4 | Fielding event credited to selected fielder(s) | Stats reflect correct fielder(s) after match completion |
| K5 | Fielder-only events (non-wicket, e.g. "Great stop") | Shown for non-dismissal balls if scope allows |
| K6 | Wicket-only fielding events | Only shown on dismissal balls |

---

## L. Season Leaderboard & Career Stats

| ID | Scenario | Expected |
|----|----------|----------|
| L1 | Leaderboard screen loads | Players listed with runs/wickets/catches |
| L2 | Caught/stumped fielder fanout via fielderIds | Multi-fielder dismissals credit all selected fielders |
| L3 | Run-out fielder fanout | Both direct-hit and backup fielders credited if selected |
| L4 | Byes/LB excluded from bowler career stats | After match completion, bowler's conceded runs don't include byes |

---

## M. Player Profiles & Ghost Linking

| ID | Scenario | Expected |
|----|----------|----------|
| M1 | Ghost player profile shows career stats | Stats from past matches shown correctly |
| M2 | Registered player profile shows career stats | Stats shown; linkedGhost section if applicable |
| M3 | Admin links ghost to registered member | Ghost type becomes 'linked'; ghost stats merged into member |
| M4 | Linked ghost excluded from squad picker | `type:'linked'` player not shown in ScheduleMatch player selection |
| M5 | Linked ghost excluded from TeamBuilder | Not shown when assigning teams |
| M6 | Admin unlinks ghost | Ghost type reverts to 'ghost'; member stats subtract frozen ghost stats |

---

## N. AI Assistant (TeamBuilder Balance)

| ID | Scenario | Expected |
|----|----------|----------|
| N1 | AI Balance button in TeamBuilder | Teams auto-assigned and saved |
| N2 | AI respects linked ghost exclusion | Linked players not assigned to teams by AI |
| N3 | AI rationale shown | Key decisions list returned and displayed |

---

## Test Environment Notes

- **Dev data**: Firestore emulator (EXPO_PUBLIC_USE_EMULATOR=true)
- **Android emulator**: Medium_Tablet AVD via `~/Library/Android/sdk/emulator/emulator`
- **ADB**: `~/Library/Android/sdk/platform-tools/adb`
- **App package**: `com.crease.cricket`
- **Screenshot scale**: Device is 2560×1600; screenshots captured at native res; displayed in viewer at 2000×1250 (scale ×1.28 for tap coordinates)
- **Coordinate mapping**: `tap_x = displayed_x × 1.28`, `tap_y = displayed_y × 1.28`
- **Build**: `npx expo run:android` from project root (redirect to `/tmp/crease-qa/build.log` to avoid tmpfs fill)

---

## Critical Fix Regression Targets (commits e5827e0, c277fdc, 8d05dbf)

These must pass on every release:

| Fix | Test IDs |
|-----|----------|
| Wide/NB physicalRuns strike rotation | F7, F8, F11, F12 |
| Bye/LB not charged to bowler | F14, F15, G3 |
| Bye/LB run options include 5 and 6 | F16 |
| Non-striker run-out toggle | F20, F21 |
| maxBowlerOvers cap in picker | F26 |
| Abandoned match excluded from prevMatch | C7 |
| Linked ghost excluded from all squad reuse | C2, C3, C4, C5, M4 |
| BowlerRow economy uses ballsPerOver | G4 |
| sealedRef double-complete guard | J5 |
| fielderIds fanout for caught/stumped | K2, L2 |
