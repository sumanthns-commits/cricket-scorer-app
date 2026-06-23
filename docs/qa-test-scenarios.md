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
| Wide/NB physicalRuns strike rotation | F7, F8, F11, F12, LL9–LL12 |
| Bye/LB not charged to bowler | F14, F15, G3, II5, II6 |
| Bye/LB run options include 5 and 6 | F16 |
| Non-striker run-out toggle | F20, F21, MM5, MM6 |
| maxBowlerOvers cap in picker | F26, TT6 |
| Abandoned match excluded from prevMatch | C7 |
| Linked ghost excluded from all squad reuse | C2, C3, C4, C5, M4, DD9 |
| BowlerRow economy uses ballsPerOver | G4, RR3, RR7 |
| sealedRef double-complete guard | J5, JJ7, X18 |
| fielderIds fanout for caught/stumped | K2, L2, II2, II3, II4 |
| seasonLeaderboard economy hardcoded /6 bug | RR7 |
| compulsoryRetirementAt not enforced | OO1–OO3 |

---

## P. Rule Configuration Variations

| ID | Precondition | Action | Expected |
|----|--------------|--------|---------|
| P1 | `ballsPerOver=5` | Score 5 legal deliveries | Over completes on 5th ball; economy = runs÷(balls÷5) |
| P2 | `ballsPerOver=8` | Score 7 legal balls then 8th | Over closes on ball 8; ball track shows 8 circles |
| P3 | `oversPerInnings` undefined/null | Score 30 overs | No "X over match" label; innings ends on all-out only |
| P4 | `oversPerInnings` undefined | On SCORING tab as admin | Edit overs pencil NOT rendered |
| P5 | 10-over match, 7 overs bowled | Admin raises overs to 15 | Limit updates; 2nd innings target recalculates |
| P6 | 10-over match, 7 overs bowled | Admin tries to reduce to 6 | Decrement disabled at 7 (min = bowled+1) |
| P7 | 10-over match, 2nd innings in progress | Admin sees SCORING tab | Edit pencil absent (`inningsNumber===1` guard) |
| P8 | `enabledExtras: []` | On SCORING tab | Extras row entirely absent |
| P9 | `enabledExtras: ['wide']` | On SCORING tab | Only "Wd" button shown |
| P10 | `enabledDismissals: ['caught','bowled','run-out']` | Tap Wicket ▼ | Sheet shows exactly those 3; LBW/Stumped/Hit Wicket absent |
| P11 | Custom dismissal `batterIsOut:false` (e.g. "Retired Hurt") | Trigger dismissal | No wicket counted; no new-batter phase; dismissal recorded |
| P12 | Custom dismissal `batterIsOut:true, isLegalDelivery:true, bowlerGetsWicket:true` | Trigger | Wicket+1, bowler wicket+1, new-batter phase, legal delivery |
| P13 | Custom dismissal `runsScored:4, batterIsOut:false` | Trigger | Score +4; batter stays; no new-batter phase |
| P14 | Custom dismissal `isLegalDelivery:false` | Trigger | Legal ball count unchanged; over does not advance |
| P15 | `autoRotateStrikeEoO:false`, 6 dots in an over | Complete over | Strike does NOT rotate at end of over |
| P16 | `autoRotateStrikeEoO:false`, 5 dots then 1 run on ball 6 | Ball 6 ends over | Strike rotates (odd run); EoO rotation suppressed; net = rotation |
| P17 | `lastManStands:true`, 2 batting players total | Dismiss 1st batter | No new-batter phase; "Last man standing" message; 2nd wicket ends innings |
| P18 | `lastManStands:true`, lone batter | Score 1 run | Strike indicator stays on lone batter; no rotation attempt |
| P19 | `maxBowlerOvers:2`, bowler has 2 complete overs | Over completes | That bowler NOT in new-bowler SelectPlayerModal |
| P20 | `maxBowlerOvers:2`, bowler at cap | Admin taps ✎ bowler row | Capped bowler absent from `changePlayers` list |
| P21 | `compulsoryRetirementAt:30` | Batter reaches 30 runs | No automatic retirement prompt shown (not implemented) |
| P22 | `roverThrowCap` set | Verify fielding point capping | Check if cap is enforced client-side or only in Cloud Function |

---

## Q. Scoring Engine — Strike Rotation Edge Cases

| ID | Scenario | Expected |
|----|----------|---------|
| Q1 | Bye +5 (`physicalRuns=5`, mid-over) | Extras+5; bowler NOT charged; oddRuns=true; rotateStrike=true |
| Q2 | Bye +6 | physicalRuns=6 (even); no rotation |
| Q3 | Wide +1 crossing check | physicalRuns=(1+1)−1=1 (odd); rotate (covers F8 XOR path) |
| Q4 | Wide +2 no rotation | physicalRuns=(1+2)−1=2 (even); no rotate |
| Q5 | No-ball +3 bat | physicalRuns=4−1=3 (odd); rotate |
| Q6 | Wicket (caught) on last ball of over | batterIsOut=true → rotateStrike=false; over complete; new-batter then new-bowler |
| Q7 | Run-out (0 runs) on last ball of over | Over completes; new-batter→new-bowler chains correctly |
| Q8 | Run-out 1 run, on-striker dismissed (crossed) | crossedOnRunOut=true; replacement enters off-strike end |
| Q9 | Run-out 1 run, non-striker dismissed (crossed) | On-striker is at non-striker end; replacement enters on-strike end |
| Q10 | Run-out 2 runs, on-striker dismissed (not crossed) | crossedOnRunOut=false; replacement enters on-strike end |
| Q11 | Run-out on no-ball | Extra+1 (NB); run-out recorded; NOT a legal delivery; batter out; new-batter |
| Q12 | Run-out on wide | Extra+1 (wide penalty); run-out recorded; NOT legal delivery |
| Q13 | Stumped off no-ball | UI should prevent this (stumped invalid off NB) — verify WicketSheet still shows stumped |
| Q14 | `obstructing-field` dismissal | No fielder picker; bowler no wicket credit |
| Q15 | `timed-out` dismissal | No fielder; bowler no credit; counts as legal delivery |
| Q16 | `handled-ball` dismissal | No fielder; bowler no credit |
| Q17 | `hit-ball-twice` dismissal | No fielder; bowler no credit |
| Q18 | Dot ball (0 runs, no dismissal) | Wagon + fielding overlay skipped; `commitBall()` called directly |
| Q19 | Pure extra (wide/NB/bye/LB, no dismissal) | Wagon + fielding overlay skipped |
| Q20 | 4 off bat (boundary) | Wagon wheel shown; after confirm, fielding overlay shown with "FOUR!" header |
| Q21 | 4 off no-ball (bat boundary + NB) | NB extra=1; bat runs=4; total=5; wagon + fielding overlay shown |
| Q22 | 6 off bat | "SIX!" in fielding overlay header |
| Q23 | Bowled dismissal | Wagon skipped (NO_WAGON list); no fielding overlay |
| Q24 | Stumped | Wagon skipped; fielding overlay shown but fielder section hidden |
| Q25 | Caught | Wagon shown; after wagon → fielding overlay with fielder section hidden |
| Q26 | Extras run-out (`forceRunOut=true`) | WicketSheet skips type step; WHO WAS RUN OUT toggle shown; completed runs section hidden |

---

## R. Undo Behaviour

| ID | Precondition | Action | Expected |
|----|--------------|--------|---------|
| R1 | Wide +0 scored (in-session) | Undo | Score−1; delivery count unchanged; ball removed |
| R2 | 4 scored (in-session) | Undo | Score−4; batter runs−4; fours−1 |
| R3 | Wicket (caught) in-session | Undo | Wicket−1; dismissed batter's isOut=false; batter returns on strike |
| R4 | Over just completed (new-bowler phase, no new bowler yet) | Undo | Over−1; legalBalls=ballsPerOver−1; phase→scoring; previous bowler re-selected |
| R5 | New bowler picked, 1 ball bowled | Undo | Reverts 1 ball; new bowler stays; over/ball count correct |
| R6 | No balls bowled yet | Undo button | Visually disabled; tapping does nothing |
| R7 | App reloaded mid-over (history=[]); 3 balls in Firestore | Undo | `undoLastBallFromFirestore()` trims last ball from Firestore; state reloads |
| R8 | 1 ball in over, app reloaded, history=[] | Undo | Over doc deleted entirely; previous over restored |
| R9 | 2nd innings, history=[] | Undo | Only 2nd innings overs affected (inningsId filter) |
| R10 | Non-striker run-out with 1 completed run | Undo | Survivors swap back; non-striker returns; on-striker run reverted |
| R11 | Bye 3 scored | Undo | Score−3; bowler runsConceded unchanged |
| R12 | 5 balls scored in-session | Undo 5 times | Each undo reverts one ball; 6th Undo attempts Firestore path |
| R13 | Empty over doc exists (artifact of prior undo) | Undo | `staleOvers` filter removes empty docs; next undo works cleanly |

---

## S. Innings Reconstruction on Reload

| ID | Precondition | Action | Expected |
|----|--------------|--------|---------|
| S1 | 2 balls bowled in over 3; app killed | Re-open LiveScoring | over=3, legalBalls=2; correct on-striker from `lastOver.onStrikeId` |
| S2 | Over 3 complete; no balls in over 4 | Re-open | overNumber=4, legalBalls=0 |
| S3 | Wicket on ball 3 of over 2; new batter selected | Re-open | Dismissed batter isOut=true; new batter at crease |
| S4 | Admin toggled batter to LHB | Re-open | Handedness NOT persisted to Firestore; reverts to profile-stored hand |
| S5 | 2nd innings mid-way; app closed | Re-open | firstInnings reconstructed; chase target correct |
| S6 | Opener 2 was put on strike first | Re-open | `firstBall.batsmanId` used as initial on-striker (not battingIds[0]) |
| S7 | 10 wickets fallen (lastManStands=true); lone batter | Re-open | offStrikeId=''; isLoneBatter=true; scoring ready |
| S8 | Over contains a bye delivery | Re-open | Bye NOT included in bowler's runsConceded in reconstruction |
| S9 | `autoRotateStrikeEoO:false`; mixed overs | Re-open after 3 overs | Batters at correct ends; same rule applied in replay |

---

## T. Undo + Reload Interaction

| ID | Precondition | Action | Expected |
|----|--------------|--------|---------|
| T1 | App reloaded, history=[] | Tap Undo | `undoLastBallFromFirestore` reads overs, finds last ball |
| T2 | Last over complete, new over has 1 ball, history=[] | Undo | Removes ball from new over; if empty, deletes over doc |
| T3 | Phase=innings-over, history=[] | Undo attempted | Undo button not visible in innings-over phase; no crash |

---

## U. Wagon Wheel Edge Cases

| ID | Scenario | Expected |
|----|----------|---------|
| U1 | Tap center dot (r < 8) | `tapToSel` returns null; Confirm shows "Skip" |
| U2 | Tap outside wheel boundary | Selection cleared |
| U3 | Tap sector 0 (12 o'clock = Straight) | Sector 0 highlighted; label "Straight" |
| U4 | LHB wagon sector labels | Sector 1 = "Mid-on" (mirrored from RHB "Mid-off") |
| U5 | RHB sector labels | Sector 1=Mid-off, sector 5=Third man, sector 7=Fine leg |
| U6 | Confirm without sector selected | Ball saved with no `wagon` field |
| U7 | Score 1 run → wagon title | "1 run" (not "1 runs") |
| U8 | Score 4 → wagon title | "FOUR!" |
| U9 | Score 6 → wagon title | "SIX!" |
| U10 | Tap inner ring | depth=0; label "Infield" |
| U11 | Tap middle ring | depth=1; label "Mid" |
| U12 | Tap outer ring | depth=2; label "Boundary" |
| U13 | Wicket → Run Out | Wagon skipped (NO_WAGON includes run-out) |
| U14 | Wicket → Bowled | Wagon skipped |
| U15 | Wicket → Stumped | Wagon skipped |
| U16 | Wicket → Hit Wicket | Wagon skipped |
| U17 | Wicket → LBW | Wagon shown (LBW not in NO_WAGON) |
| U18 | Wicket → Caught | Wagon shown |

---

## V. Fielding Overlay Details

| ID | Scenario | Expected |
|----|----------|---------|
| V1 | Select fielder | Auto-dismiss timer resets to 6s |
| V2 | Tap fielding event chip | Timer resets |
| V3 | Select 2 fielders, wait 6s | Panel closes; both fielderIds saved |
| V4 | Tap backdrop above panel | `finish()` called; selection saved |
| V5 | No fielder selected | Summary shows "None" |
| V6 | Select 1 fielder | Summary shows full displayName |
| V7 | Select 3 fielders | Summary shows "FirstName +2" |
| V8 | Dot ball | No fielding panel |
| V9 | Wide (no dismissal) | No fielding panel |
| V10–V12 | Score 1, 2, 3 runs | Fielding panel shown |
| V13 | `scope:'non-wicket'` event on a wicket ball | Event absent from fielding overlay |
| V14 | `scope:'wicket'` event | Shown in WicketSheet; absent from FieldingPanel |
| V15 | `scope:'both'` event | Appears in both WicketSheet and FieldingPanel |
| V16 | Legacy event (no scope field) | Treated as 'both'; appears in both |
| V17 | `wicketTypes:['caught']` filter | Shown only when dismissal type is caught |
| V18 | `wicketTypes:[]` | Shown for all wicket types |
| V19 | Substitute in fielding overlay | Sub appears in fielderIds list |
| V20 | 11+ fielders — scrollability | Overlay scrolls; all players reachable |
| V21 | Batting-team-only player | Does NOT appear in fielding overlay |
| V22 | `hideFielders:true` (stumped) | Fielder section absent; events still shown |
| V23 | No events configured | Panel shows; events section absent |
| V24 | Positive polarity event credited | `fieldingPoints` incremented after match completion |
| V25 | Negative polarity event (e.g. "Drop") | `fieldingPoints` decremented |
| V26 | Neutral polarity event | `fieldingPoints` unchanged; `fieldingEventCounts[label]` +1 |

---

## W. WicketSheet Details

| ID | Scenario | Expected |
|----|----------|---------|
| W1 | Caught — select catcher | Done enabled; events shown below catcher |
| W2 | Caught + event selected | Event in `pendingFieldingRef`; passed through to BallEntry |
| W3 | Run-out → no fielder selected | Done shows "Done (0)"; disabled |
| W4 | Run-out → select 2 fielders | Done shows "Done (2)"; both fielderIds passed |
| W5 | WHO WAS RUN OUT default | On-striker highlighted by default |
| W6 | Switch dismissed to non-striker | Non-striker card shows "dismissed"; on-striker shows "on strike" |
| W7 | Run-out completed runs default | 0 runs |
| W8 | Run-out completed runs picker | Select 2 runs → completedRuns=2; score+2 |
| W9 | WicketSheet Cancel on extras run-out | `pendingExtraRunOut` cleared; no stale extra |
| W10 | Custom dismissal — no step 2 | `onSelect(cd.id)` called immediately (no fielder step) |
| W11 | `forceRunOut:true` | Type step skipped; straight to fielder picker |
| W12 | Stumped — single fielder (non-multi) | Single-select path; Done after 1 pick |
| W13 | Bowled dismissal | `needsFielder=false`; `onSelect('bowled')` immediately; no step 2 |

---

## X. Match Lifecycle Edge Cases

| ID | Scenario | Expected |
|----|----------|---------|
| X1 | Non-admin user opens LiveScoring | "Watching live" shown; run/extra/wicket buttons absent |
| X2 | Non-admin on TEAMS tab | "+ Add Substitute" and ✕ absent |
| X3 | Non-admin TEAMS tab, no balls | "Edit Teams" absent |
| X4 | Non-admin — ✎ buttons | Edit icons not rendered on batter/bowler rows |
| X5 | Non-admin taps off-striker | Tap is no-op (`onPress={isAdmin ? swapStrike : undefined}`) |
| X6 | No balls bowled yet | "Delete match" shown (not "Abandon match") |
| X7 | Delete match → confirm | Match removed from Firestore; navigation exits |
| X8 | Delete match → cancel | No action |
| X9 | Abandon match → confirm | Status→'abandoned'; exits to Matches |
| X10 | Abandon match → cancel | No action |
| X11 | 2nd innings batting team all out below target | "Team batting first won by X runs" result |
| X12 | 2nd innings target reached before all overs | "Team batting second won" result |
| X13 | 2nd innings total = firstInningsRuns | "Match tied" result |
| X14 | 1 run win: singular "run" | "won by 1 run" (not "1 runs") |
| X15 | Target reached mid-over | `phase='innings-over'` immediately on that ball |
| X16 | sealedRef guard | Re-render/focus does not call `completeMatch()` a second time |
| X17 | Navigate to LiveScoring of completed match | "Match not available" shown |
| X18 | Navigate to LiveScoring of abandoned match | "Match not available" shown |
| X19 | scoringReady=false at match start | Run buttons disabled (opacity 0.4, pointerEvents='none') |
| X20 | offStrikeId='' (last man stands) | swapStrike() is a no-op; lone batter stays on strike |

---

## Y. ScheduleMatch Edge Cases

| ID | Scenario | Expected |
|----|----------|---------|
| Y1 | No previous match exists (first match ever) | Reuse radio buttons absent; only fresh squad picker |
| Y2 | Day-increment at month end | Day wraps to next month correctly |
| Y3 | Year minimum 2020 | Year stays at 2020 when decrement pressed |
| Y4 | `customOvers='0'` | `parseInt('0')>=1` false; Submit disabled |
| Y5 | `customOvers='-1'` | Submit disabled |
| Y6 | `customOvers='4.5'` | parseInt=4; validates as 4 overs |
| Y7 | Format=T20 | `customOvers` input hidden; always valid |
| Y8 | Squad of 2 players | Submit enabled |
| Y9 | Squad of 1 player | Submit disabled |
| Y10 | Quick rematch with no prevMatch | Radio button absent (`{prevMatch && ...}` guard) |
| Y11 | Quick rematch confirmed | Navigates directly to Toss; no TeamBuilder visit |
| Y12 | Quick rematch carries `oversPerInnings` | New match rules include `oversPerInnings` from prevMatch |
| Y13 | teams-edit: captainB not in selectedIds | captainB=undefined; captainA pre-selected if in selectedIds |
| Y14 | "Select All" | Selects only non-linked players |
| Y15 | "Clear All" | 0 selected; counter shows 0 |
| Y16 | Switch reuse mode to 'none' | Selection cleared |
| Y17 | Switch back from 'none' to 'squad' | prevMatch.squad re-applied |
| Y18 | Home/away blank | homeTeam defaults to `club.name`; awayTeam to "Opponents" |
| Y19 | ScheduleMatch → TeamBuilder uses navigate | Back returns to form with values intact |

---

## Z. TeamBuilder Edge Cases

| ID | Scenario | Expected |
|----|----------|---------|
| Z1 | Odd squad: 1 player shared between A and B | "SH" yellow badge shown |
| Z2 | Odd squad: assign to A then B | Player in both (allowShared=true); no auto-remove from A |
| Z3 | Even squad: assign to A then B | Removed from A, added to B |
| Z4 | Captain in A, moved to B | captainA cleared by validation useEffect |
| Z5 | Both captains absent | Warning: "Set a captain for both teams" |
| Z6 | captainA=null with players assigned | Confirm button hidden/disabled |
| Z7 | Tap ✕ to unassign player | Player moves to UNASSIGNED section |
| Z8 | Team B empty | canConfirm=false |
| Z9 | AI parse error | "AI responded but could not produce a valid team split" error shown |
| Z10 | AI 429 rate-limit | "Too many requests — please wait a moment" |
| Z11 | AI 403 auth error | "AI is not available — Vertex AI API may not be enabled" |
| Z12 | AI network error | "Network error — check your connection" |
| Z13 | AI rationale modal | Tap 'i' → rationale + keyDecisions shown; close dismisses |
| Z14 | 'i' button absent before AI run | `rationale===''` → 'i' not rendered |
| Z15 | AI in-progress | Button shows ActivityIndicator; disabled |
| Z16 | `returnTo='LiveScoring'` | After confirm → `navigation.replace('LiveScoring', ...)` |
| Z17 | Normal flow | After confirm → `navigation.navigate('Toss', ...)` |
| Z18 | Captain name in homeTeam | homeTeam = "Team [CaptainName]" when captainA set |

---

## AA. Substitutes Edge Cases

| ID | Scenario | Expected |
|----|----------|---------|
| AA1 | Sub from bowling team | No duplicate in overlay (already in bowlingIds) |
| AA2 | Sub from batting team | Appears in overlay (substituteIds) |
| AA3 | All players already subs | "All players are already substitutes" message |
| AA4 | Remove substitute mid-match | Disappears from TEAMS tab and overlay |
| AA5 | Sub (batting-team-only) not in new-bowler picker | Filtered to `innings.bowlingIds` |
| AA6 | Sub (bowling-team-only) not in new-batter picker | Filtered to `innings.battingIds` |
| AA7 | Sub added after `firstBallBowled=true` | "Edit Teams" hidden; "Add Substitute" still available |
| AA8 | Sub picker excludes existing subs | Player already in substitutes is absent from picker |
| AA9 | `addSubstitute` Firestore write | Uses `arrayUnion` (not overwrite) |
| AA10 | `removeSubstitute` Firestore write | Uses `arrayRemove`; other subs unaffected |
| AA11 | Optimistic add | Sub appears in TEAMS tab immediately |
| AA12 | Optimistic remove | Sub disappears immediately |

---

## BB. Score Header & Chase Display

| ID | Scenario | Expected |
|----|----------|---------|
| BB1 | `ballsPerOver=5`; 20 runs in 1 over | CRR = (20×5)/5 = 20.00 |
| BB2 | 0 balls bowled | CRR = "0.00" |
| BB3 | Over 2, 3 legal balls | Header shows "2.3 ov" |
| BB4 | `ballsPerOver=8` | Header shows "(8 ball overs)" label |
| BB5 | `ballsPerOver=6` | "(6 ball overs)" NOT shown |
| BB6 | 2nd innings with `oversPerInnings` | "Need X runs from Y balls" shown |
| BB7 | 2nd innings without over limit | "Need X runs" (no "from Y balls") |
| BB8 | Balls remaining > 0 | RRR shown |
| BB9 | No `oversPerInnings` | RRR absent |
| BB10 | Need exactly 1 run | "Need 1 run" (singular) |
| BB11 | Target display | "Target 144 · RRR X.XX" |
| BB12 | Score reaches 1000 | Renders as "1000"; no truncation |

---

## CC. Scorecard Tab Details

| ID | Scenario | Expected |
|----|----------|---------|
| CC1 | Batter not yet at crease, 0 runs/balls | Filtered out (unless onStrikeId/offStrikeId) |
| CC2 | Current batters with 0(0) | Always shown (onStrikeId/offStrikeId override filter) |
| CC3 | Dismissal text: caught | "c FielderName b BowlerName" |
| CC4 | Dismissal text: c&b (no fielder ID) | "c & b BowlerName" |
| CC5 | Dismissal text: stumped | "st KeeperName b BowlerName" |
| CC6 | Dismissal text: run out with fielder | "run out (FielderName)" |
| CC7 | Dismissal text: run out no fielder | "run out" |
| CC8 | Multi-fielder run-out | "run out (Fielder1 & Fielder2)" |
| CC9 | Custom dismissal type | Falls to `default: return d.type` → shows raw ID, not label |
| CC10 | On-strike indicator | Asterisk (*) shown in accent color after name |
| CC11 | Economy `ballsPerOver=5`, 15 balls, 30R | `30/(15/5)` = 10.0 |
| CC12 | Overs display `ballsPerOver=5`, 14 balls | "2.4" |
| CC13 | Innings 1 scorecard during 2nd innings | Toggle to "Innings 1" shows firstInnings data |
| CC14 | Innings switcher in 1st innings | Toggle absent |

---

## DD. Player Profile & Ghost Linking

| ID | Scenario | Expected |
|----|----------|---------|
| DD1 | Player with all-zero career stats | No division-by-zero or NaN in computed fields |
| DD2 | Player with 10,000 runs | No integer overflow; correct formatting |
| DD3 | careerStats reads via statsResolver | No direct `player.careerStats` in any component |
| DD4 | Linked ghost merged stats | Member profile shows combined stats |
| DD5 | `publicPlayerStats` mirror update | After match completed, `publicPlayerStats/{uid}_{clubId}` updated |
| DD6 | Unlink ghost | Member careerStats reduced by frozen ghost stats |
| DD7 | `fieldingEventCounts` accumulates | "Great stop" × 2 matches → `fieldingEventCounts['Great stop']===2` |
| DD8 | `fieldingPoints` net | Positive+negative events = correct net |
| DD9 | `type:'linked'` player in `getClubPlayers` | Excluded from results |
| DD10 | `highScore` updated | New personal best reflected after match completion |
| DD11 | `matchesPlayed` incremented | Correct count after 2nd match |

---

## EE. AI Team Selection Edge Cases

| ID | Scenario | Expected |
|----|----------|---------|
| EE1 | Short key aliasing (p1, p2...) | `keyToId` maps back to Firebase IDs; no assignment lost |
| EE2 | AI assigns all to one team | `parseTeamSelection` returns null; error shown |
| EE3 | New per-player format | `Array.isArray(parsed.players)` path parsed correctly |
| EE4 | Legacy format `{team_a:[...], team_b:[...]}` | Legacy parse path used |
| EE5 | AI rationale + keyDecisions | 'i' button appears; both shown in modal |
| EE6 | AI rationale, empty keyDecisions | Text shown; no bullet list |
| EE7 | `strengthOverride` passed to AI | Override values in stats payload |
| EE8 | Linked ghost in club | Excluded from AI entirely |

---

## FF. App Launch, Auth, Deep Links

| ID | Scenario | Expected |
|----|----------|---------|
| FF1 | Deep link to completed match LiveScoring | Phase='no-match'; "Match not available" |
| FF2 | Back stack ScheduleMatch → TeamBuilder | Back returns to form intact |
| FF3 | Back from Toss | Returns to TeamBuilder (normal) or ScheduleMatch (quick rematch) |
| FF4 | `useFocusEffect` on LiveScoring return | `load()` called on refocus; state refreshed |
| FF5 | Tabs remember state on switch | SCORING tab state intact after switching to SCORECARD and back |
| FF6 | STATS tab with only 2 balls | No crash on minimal data |
| FF7 | Auth token refresh | No token written to AsyncStorage |

---

## GG. Offline / Slow Network

| ID | Scenario | Expected |
|----|----------|---------|
| GG1 | Score ball while Firestore write fails | UI updates optimistically; error swallowed silently |
| GG2 | Undo while offline | In-session history undo works; Firestore may desync |
| GG3 | Firestore undo (history=[]) while offline | No crash; `getMatchOvers` fails silently |
| GG4 | Rapid ball entry (slow Firestore) | Each `saveOver` writes full `newOverBalls`; later writes overwrite; no corruption |
| GG5 | Rapid taps on scoring buttons | Wagon/fielding modals gate the flow; no double-ball commit |
| GG6 | `updateMatchOvers` fails | Alert shown; `load()` called to revert |
| GG7 | `abandonMatch` fails | Alert; stays on LiveScoring |
| GG8 | `deleteMatch` fails | Alert; stays on LiveScoring |
| GG9 | `completeMatch` fails at 2nd innings end | sealedRef stays true; match may remain 'live' in Firestore |

---

## HH. UI / UX / Accessibility

| ID | Scenario | Expected |
|----|----------|---------|
| HH1 | Long player name in BatterRow | Truncated with ellipsis (numberOfLines=1) |
| HH2 | Long player name in fielding overlay | Fits within `flex:1`; no overflow |
| HH3 | Long names in run-out toggle | Cards side by side (`flex:1`); names truncated gracefully |
| HH4 | Light mode | All hex colors correct; no Tailwind arbitrary classes |
| HH5 | Dark mode | Surface/text/border correct in dark palette |
| HH6 | Run buttons on small phone (360px) | 6 buttons per row; all visible; no overflow |
| HH7 | 7+ balls in current over | Ball track wraps to second line (`flexWrap:'wrap'`) |
| HH8 | Empty squad in TeamBuilder | No players; cannot confirm |
| HH9 | Squad with 30 players | Scrollable; no perf issue; AI handles large array |
| HH10 | ScheduleMatch loading | Submit disabled while `loadingPlayers=true` |
| HH11 | App version visible | Version string shown in Settings/Profile |
| HH12 | Hemisphere 'N' | Northern Hemisphere season naming |
| HH13 | Hemisphere 'S' | Southern Hemisphere season naming |

---

## II. Data Integrity (Post-Match Cloud Function)

| ID | Verify |
|----|--------|
| II1 | `FieldValue.increment()` for all careerStats counters (no read-modify-write) |
| II2 | `fielderIds` fanout: multi-fielder run-out credits all fielders with `totalRunOuts+1` |
| II3 | `fielderId` legacy: old ball with only `fielderId` still credits correctly |
| II4 | Client-side `seasonLeaderboard.ts` fans out via `fielderIds ?? [fielderId]` |
| II5 | 5 byes → bowler's `totalRunsConceded` unchanged for those 5 |
| II6 | Leg-byes same as II5 |
| II7 | Stumped → `bowlerGetsWicket=false` → bowler NOT credited in career stats |
| II8 | Run-out → bowler NOT credited |
| II9 | Bye 3 runs → `bat.runs` unchanged; extras+3 |
| II10 | NB + 3 bat runs → batter gets +3; NB penalty is extra |
| II11 | `publicPlayerStats` synced after member stats update |

---

## JJ. Phase State Machine — Transitions

| ID | Precondition | Action | Expected |
|----|--------------|--------|---------|
| JJ1 | Phase=scoring; openers + bowler blank | Tap any run button | Rejected; warning shown; phase stays scoring |
| JJ2 | Phase=scoring; off-striker blank; 0 wickets | Tap run button | Blocked by `(!offStrikeId && totalWickets===0)` guard |
| JJ3 | Wicket falls on last ball of over | Ball committed | Phase→new-batter first; `needsNewBowlerAfterBatterRef=true`; then new-bowler |
| JJ4 | Phase=new-batter; navigate to SCORECARD | Return | Phase remains new-batter; SelectPlayerModal re-shown |
| JJ5 | Phase=new-bowler; navigate to TEAMS | Return | Phase stays new-bowler; modal visible |
| JJ6 | Phase=innings-over (1st innings); non-admin | Admin hasn't started 2nd innings | Non-admin sees "Waiting for 2nd innings..."; cannot advance |
| JJ7 | Phase=innings-over (2nd innings) | Phase effect fires; sealedRef guard | `completeMatch()` called exactly once on re-focus |
| JJ8 | Phase=scoring; Firestore undo crosses over boundary | `undoLastBallFromFirestore()` runs; over doc deleted | Innings reconstructed; phase=scoring; overNumber decremented |
| JJ9 | Phase=new-batter; backdrop tapped | (No `onClose` passed for new-batter modal) | Modal stays open; user forced to pick batter |
| JJ10 | Phase=scoring; admin abandons mid-over | `handleAbandon()` | Status→abandoned; exits; no innings-over phase entered |

---

## KK. reconstructInnings Correctness

| ID | Precondition | Action | Expected |
|----|--------------|--------|---------|
| KK1 | Over doc has `isComplete:true` with stored `onStrikeId` | reconstructInnings | Uses `lastOver.onStrikeId`; overNumber=lastOver.overNumber+1; legalBalls=0 |
| KK2 | Over doc `isComplete:false`, 4 balls, 6-ball match | reconstructInnings | legalBalls=4; currentOverBalls=those 4 balls |
| KK3 | First ball batsmanId = Player B (not first in battingIds) | reconstructInnings | onStrikeId = Player B (from firstBall.batsmanId) |
| KK4 | Non-striker run-out saved in over doc | Reconstruction replay | `lastOver.onStrikeId`/`offStrikeId` corrects any mid-replay state |
| KK5 | `isComplete:true`, `autoRotateStrikeEoO:true` | reconstructInnings | Ball-level + over.isComplete rotations cancel (XOR); correct end result |
| KK6 | `autoRotateStrikeEoO:false`, single on last ball of over | reconstructInnings | Single rotation (run); no EoO second rotation; correct |
| KK7 | `overs.length===0` (fresh innings) | beginInnings | onStrikeId=''; offStrikeId=''; scoringReady=false |
| KK8 | `firstBall.batsmanId` is a substitute (not in battingIds) | reconstructInnings | Substitute's batting stats accumulated by batsmanId key; offStrikeId found normally |
| KK9 | 2nd innings in progress; scorer signs out and back | load() | firstInnings and firstInningsRuns both set; inningsNumber=2; chase bar shown |

---

## LL. Strike Rotation XOR Table (ballsPerOver=6)

| ID | Runs | Mid/EoO | Wicket | Expected rotation | Test |
|----|------|---------|--------|-------------------|------|
| LL1 | 0 physical | mid-over | no | false XOR false = false | Dot ball; on-striker stays |
| LL2 | 1 physical | mid-over | no | true XOR false = true | 1 run; strike changes |
| LL3 | 2 physical | mid-over | no | false XOR false = false | 2 runs; no change |
| LL4 | 1 physical | end-of-over | no | true XOR true = false | 1 run on ball 6; odd + EoO cancel; same batter faces next over |
| LL5 | 2 physical | end-of-over | no | false XOR true = true | 2 runs on ball 6; EoO only; different batter next over |
| LL6 | 0 physical | end-of-over | no | false XOR true = true | Dot on ball 6; EoO rotation only |
| LL7 | any | any | yes | batterIsOut=true → false | Wicket; rotateStrike always false |
| LL8 | `autoRotateEoO:false`, 0 runs, EoO | — | no | effectiveRotate = !false = true (flag inverts EoO) | Confirm with autoRotateEoO=off + dot + EoO |
| LL9 | Wide +0 | mid-over | no | physicalRuns=0; false | Plain wide; no rotation |
| LL10 | Wide +1 | mid-over | no | physicalRuns=1; true | Wide+1 run; rotate |
| LL11 | NB +0 | mid-over | no | physicalRuns=0; false | Plain NB; no rotation |
| LL12 | NB +1 bat | mid-over | no | physicalRuns=1; true | NB+1 bat run; rotate |

---

## MM. Run-Out Crossing Logic

| ID | Scenario | Expected |
|----|----------|---------|
| MM1 | On-striker out, 0 runs (not crossed) | crossedOnRunOut=false; replacement enters on-strike end |
| MM2 | On-striker out, 1 run (crossed) | crossedOnRunOut=true (1 is odd); replacement enters off-strike end |
| MM3 | On-striker out, 2 runs (not crossed) | crossedOnRunOut=false; replacement enters on-strike end |
| MM4 | On-striker out, 3 runs (crossed) | crossedOnRunOut=true; replacement enters off-strike end |
| MM5 | Non-striker out, 0 runs | isNonStrikerRunOut=true; newBatterEndRef='offStrike'; replacement fills non-striker slot |
| MM6 | Non-striker out, 1 run (crossed) | crossedOnRunOut=true; newBatterEndRef='onStrike'; replacement enters on-strike |
| MM7 | Wide +1 run; on-striker dismissed | physicalRuns=(1+1)−1=1 (odd); crossedOnRunOut=true; replacement off-strike |
| MM8 | NB +2 bat runs; non-striker dismissed, runOut=true | runsOffBat=0 (runOut path); physicalRuns=1−1=0; not crossed; replacement off-strike |

---

## NN. lastManStands Wicket Threshold

| ID | Scenario | Expected |
|----|----------|---------|
| NN1 | lastManStands=false; squad=11; 9th wicket | innings continues; new batter picker |
| NN2 | lastManStands=false; squad=11; 10th wicket | wicketsToEnd=10; 10>=10; innings over |
| NN3 | lastManStands=true; squad=11; 9th wicket | innings continues; new batter picker |
| NN4 | lastManStands=true; squad=11; 10th wicket | "Last man standing" state; offStrikeId='' |
| NN5 | lastManStands=true; lone batter dismissed | allOut=true; innings over |
| NN6 | lastManStands=true; squad=8; 7th wicket | continues; last pair remains |
| NN7 | Reconstruction; lastManStands=true; 6/7 wickets | allOut=false; phase=scoring (not innings-over) |
| NN8 | Admin changes lastManStands rule mid-match | Snapshot rules (`match.rules`) govern; live club rule ignored |

---

## OO. compulsoryRetirementAt — Enforcement Gap

| ID | Scenario | Expected |
|----|----------|---------|
| OO1 | `compulsoryRetirementAt:30`; batter reaches 30 | No automatic retirement prompt (not implemented) |
| OO2 | Batter on 29 hits 4 | Threshold silently exceeded; batting continues |
| OO3 | Admin manually retires via ✎ change batter | Retired batter's `isOut` NOT set; can be re-selected |
| OO4 | `compulsoryRetirementAt` undefined | No crash; ignored |

---

## PP. Custom Dismissals — All Combinations

| ID | Scenario | Expected |
|----|----------|---------|
| PP1 | Custom `batterIsOut:false` | No wicket counted; phase stays scoring |
| PP2 | Custom `batterIsOut:true`, `isLegalDelivery:false` | New-batter phase; legal ball NOT incremented |
| PP3 | Custom `runsScored:4`, `batterIsOut:false` | Score+4; no wicket; no strike rotation (even) |
| PP4 | Custom `runsScored:0`, `batterIsOut:true`, `isLegalDelivery:true` | 0 runs; wicket counted; new-batter |
| PP5 | Custom `isLegalDelivery:false`, `batterIsOut:false` | Over count not advanced; no wicket |
| PP6 | Custom dismissal not in STD_LABELS | Wagon skipped; fielding overlay skipped; committed directly |
| PP7 | Custom `batterIsOut:true` then Undo | totalWickets−1; batter's isOut=false; phase=scoring |
| PP8 | Custom `batterIsOut:false` on last ball of over | Legal delivery (if isLegalDelivery=true); over completes; new-bowler |

---

## QQ. Over Edit (EditOversModal)

| ID | Scenario | Expected |
|----|----------|---------|
| QQ1 | All 4 `canEditOvers` conditions met | Edit pencil shown |
| QQ2 | inningsNumber=2 | Pencil absent |
| QQ3 | phase='new-bowler' | Pencil absent |
| QQ4 | `oversPerInnings=null` | No overs chip; no edit UI |
| QQ5 | Reduce below overs already bowled | Decrement disabled at `bowled+1`; Save disabled if unchanged |
| QQ6 | Reduce to floor and save | `updateMatchOvers()`; innings ends when that over completes |
| QQ7 | Increase overs; 2nd innings starts | 2nd innings uses updated `oversPerInnings` |
| QQ8 | Network fails during save | Alert shown; `load()` reverts state |
| QQ9 | Save with same value as current | No Firestore write; modal closes |
| QQ10 | 2nd innings; overs chip tapped | `canEditOvers=false`; tap is no-op |

---

## RR. BowlerRow Stats Display

| ID | Scenario | Expected |
|----|----------|---------|
| RR1 | 7 legal balls, `ballsPerOver=6` | "1.1-0-R-W" (completedOvers=1, partial=1) |
| RR2 | 5 legal balls, `ballsPerOver=5` (1 complete) | "1.0-0-R-W" |
| RR3 | 6 legal balls, `ballsPerOver=5` (1 complete + 1 partial) | "1.1-0-R-W"; economy=(R/6)×5 uses correct ballsPerOver |
| RR4 | 0 runs, 12 legal balls | Economy = "0.0" (not '–'; guard only hides for 0 legal balls) |
| RR5 | Scorecard overs display, 7 legal balls, bpo=6 | "1.1" (consistent with BowlerRow) |
| RR6 | Scorecard economy: 4 balls, 20R, bpo=6 | 20/(4/6) = 30.0 |
| RR7 | **BUG**: seasonLeaderboard economy uses hardcoded /6 | For bpo=5 clubs: leaderboard econ inflated vs live scorecard |
| RR8 | 5 legal balls, bpo=6 (incomplete over) | "0.5" displayed |

---

## SS. Season Leaderboard Edge Cases

| ID | Scenario | Expected |
|----|----------|---------|
| SS1 | No matches in season | All three tabs show "No data" messages; matchesCounted=0 |
| SS2 | Player with 0 runs, 3 balls (duck, not out) | Appears with 0R, 3B, SR=0.0; sorted to bottom |
| SS3 | All players 0 wickets | Entries shown; `average` = '–'; sorted by economy |
| SS4 | Tiebreak: same runs, different highScore | Higher highScore appears first |
| SS5 | Tiebreak: same wickets, different economy | Lower economy appears first |
| SS6 | Only negative-polarity events, 0 dismissals | Player appears (eventPoints≠0); score=negative |
| SS7 | 0 eventPoints, 1 catch | score=5; shown correctly |
| SS8 | Only neutral events, 0 dismissals | Excluded (score=0 AND dismissals=0) |
| SS9 | Match with 0 overs AND no inningsSummary | Skipped; matchesCounted not incremented |
| SS10 | Ghost linked mid-season; ghostToMember map | All ghost-ID balls resolved to member ID |
| SS11 | `fieldingEventCounts` breakdown | Not surfaced in leaderboard UI (by design or gap) |
| SS12 | Abandoned match with partial innings | Stats from completed overs counted |
| SS13 | Fielding tiebreak | More dismissals appears above equal-score player |

---

## TT. Additional Scoring Flow Gaps

| ID | Scenario | Expected |
|----|----------|---------|
| TT1 | Bye/LB + run-out (`runOut:true` in modal) | WicketSheet opens with `forceRunOut:true`; completed-runs section hidden; extra runs as extras |
| TT2 | No-ball + run-out; 2 bat runs selected | runsOffBat=0 (correct per law); 2 bat runs silently dropped; only NB penalty counted |
| TT3 | Wide + run-out; +3 runs selected | extraRuns=4; physicalRuns=4−1=3 (odd); crossedOnRunOut=true |
| TT4 | Target reached on last ball of last over | innings-over fires before oversDone; "Match tied" result correct |
| TT5 | `swapStrike()` with offStrikeId='' | No-op (falsy guard); lone batter stays |
| TT6 | Admin changes bowler mid-over | Capped bowlers and current bowler absent from picker |
| TT7 | Admin changes on-striker to batter who has existing stats | Existing runs/balls preserved; not reset to 0 |
| TT8 | Close WicketSheet on extras run-out | `pendingExtraRunOut` cleared; no stale state |
| TT9 | Obstructing-field dismissal | No fielder picker; wicket counted; bowler no credit |
| TT10 | Timed-out dismissal | Recorded against on-striker; no special UI validation |
