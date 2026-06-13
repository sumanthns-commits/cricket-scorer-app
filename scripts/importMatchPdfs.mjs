#!/usr/bin/env node
/**
 * importMatchPdfs.mjs
 *
 * Reads Stumps match-report PDFs from a folder and imports each one into a
 * selected club as a completed match, auto-creating ghost players as needed.
 *
 * Usage:
 *   node scripts/importMatchPdfs.mjs [options]
 *
 * Options:
 *   --env emulator|staging|prod   Firestore target (default: emulator)
 *   --seed-dir <path>             Folder containing PDFs (default: ./seed)
 *   --dry-run                     Preview without writing to Firestore
 *
 * Requires: poppler  (brew install poppler)  for pdftotext
 */

import { execSync, execFileSync } from 'child_process';
import { readdirSync, existsSync } from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const option  = (name, def) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : def; };

const ENV      = option('--env', 'emulator');
const DRY      = hasFlag('--dry-run');
const SEED_DIR = path.resolve(option('--seed-dir', './seed'));

if (!['emulator', 'staging', 'prod'].includes(ENV)) {
  console.error(`Unknown --env "${ENV}". Use: emulator | staging | prod`);
  process.exit(1);
}

// ─── Firebase init ────────────────────────────────────────────────────────────

let PROJECT_ID;
switch (ENV) {
  case 'emulator':
    PROJECT_ID = process.env.PROJECT_ID ?? 'cricket-scorer-staging';
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';
    break;
  case 'staging':
    PROJECT_ID = process.env.PROJECT_ID ?? 'cricket-scorer-staging';
    break;
  case 'prod':
    PROJECT_ID = process.env.PROJECT_ID;
    if (!PROJECT_ID) {
      console.error('Set PROJECT_ID env var for --env prod.');
      process.exit(1);
    }
    break;
}

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

console.log(`\nEnv: ${ENV}  |  Project: ${PROJECT_ID}${DRY ? '  |  DRY RUN' : ''}`);

// ─── PDF text extraction ──────────────────────────────────────────────────────

function extractText(filePath) {
  return execFileSync('pdftotext', ['-layout', filePath, '-'], { encoding: 'utf8' });
}

// ─── PDF parsing ──────────────────────────────────────────────────────────────

/** Convert "1.4" (1 over, 4 balls) to total balls. */
function oversToBalls(oversStr) {
  const n = parseFloat(oversStr);
  return Math.floor(n) * 6 + Math.round((n % 1) * 10);
}

/**
 * Parse fielding credits out of a Stumps dismissal string.
 * Mutates the provided tally maps.
 *   "c Anoop b Mayur"          → Anoop +1 catch
 *   "c & b Mayur"              → Mayur +1 catch
 *   "st Keeper b Bowler"       → Keeper +1 stumping
 *   "run out (Name1/Name2)"    → each +1 runOut
 *   everything else            → no fielding credit
 */
function parseDismissal(dismissal, catches, stumpings, runOuts) {
  if (!dismissal || dismissal === 'not out') return;

  // caught: "c Fielder b Bowler" or "c & b Bowler"
  const caughtM = dismissal.match(/^c (.+?)\s+b (.+)$/i);
  if (caughtM) {
    const rawFielder = caughtM[1].trim();
    // "c & b Bowler" → catcher is the bowler
    const fielder = (rawFielder === '&' || rawFielder === '& b') ? caughtM[2].trim() : rawFielder;
    catches[fielder] = (catches[fielder] ?? 0) + 1;
    return;
  }
  // stumped: "st Keeper b Bowler"
  const stumpM = dismissal.match(/^st (\S+)/i);
  if (stumpM) {
    const keeper = stumpM[1].trim();
    stumpings[keeper] = (stumpings[keeper] ?? 0) + 1;
    return;
  }
  // run out: "run out (Name1/Name2)" or "run out (Name)"
  const roM = dismissal.match(/run out.*\(([^)]+)\)/i);
  if (roM) {
    for (const name of roM[1].split(/[/,]/).map(n => n.trim()).filter(Boolean)) {
      runOuts[name] = (runOuts[name] ?? 0) + 1;
    }
  }
}

/**
 * Parse one innings block (lines between "Xst Innings Scorecard" markers).
 * Returns { teamName, batting[], bowling[], catchMap, stumpingMap, runOutMap }
 */
function parseInnings(block) {
  const batting  = [];
  const bowling  = [];
  const catchMap = {};
  const stumpingMap = {};
  const runOutMap   = {};

  let teamName   = '';
  let headerSeen = false;
  let section    = 'batting'; // 'batting' | 'bowling' | 'done'

  for (const line of block) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/\d+(?:st|nd|rd|th) Innings Scorecard/.test(trimmed)) continue;
    if (/Match report created from|Download.*STUMPS|^STUMPS$/.test(trimmed)) continue;

    // Team name + column header on the same line:
    //   "     1 FCC TEAM B            R    B   4s   6s   SR"
    if (!headerSeen) {
      const hdr = line.match(/^\s+(.+?)\s{3,}R\s+B\s+4s\s+6s\s+SR\s*$/);
      if (hdr) {
        teamName   = hdr[1].trim();
        headerSeen = true;
        continue;
      }
      continue;
    }

    if (section === 'done') continue;

    // Bowling header → switch section
    if (/^\s+Bowler\s+O\s+M\s+R\s+W/.test(line)) {
      section = 'bowling';
      continue;
    }

    // Fall-of-wickets header / values
    if (/Fall Of Wickets/.test(trimmed)) continue;
    if (/^\s*\d+-\d+ \(/.test(line))    continue; // FOW values

    // Extras / Total rows (not needed for stats but skip cleanly)
    if (/^\s+Extras\b/.test(line))  continue;
    if (/^\s+Total\b/.test(line))   continue;
    if (/^\s+Overs\b/.test(line))   continue;
    if (/^\s+Run Rate\b/.test(line)) continue;

    if (section === 'batting') {
      // "     Name    Dismissal text    R    B   4s   6s   SR"
      const m = line.match(
        /^\s+(.+?)\s{2,}(.+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s*$/,
      );
      if (!m) continue;
      const rawName  = m[1].trim();
      const isCaptain = /\(C\)/i.test(rawName);
      const name     = rawName.replace(/\s*\(C\)\s*/i, '').trim();
      const dismissal = m[2].trim();
      batting.push({
        name, isCaptain, dismissal,
        runs:   parseInt(m[3]),
        balls:  parseInt(m[4]),
        fours:  parseInt(m[5]),
        sixes:  parseInt(m[6]),
        notOut: dismissal === 'not out',
      });
      parseDismissal(dismissal, catchMap, stumpingMap, runOutMap);
    } else if (section === 'bowling') {
      // "     Name    1.0    0    5    0   5.0    1    0    0    0    0"
      const m = line.match(
        /^\s+(.+?)\s{2,}([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)/,
      );
      if (!m) continue;
      const rawName   = m[1].trim();
      const isCaptain = /\(C\)/i.test(rawName);
      const name      = rawName.replace(/\s*\(C\)\s*/i, '').trim();
      bowling.push({
        name, isCaptain,
        overs:   m[2],
        balls:   oversToBalls(m[2]),
        maidens: parseInt(m[3]),
        runs:    parseInt(m[4]),
        wickets: parseInt(m[5]),
      });
    }
  }

  return { teamName, batting, bowling, catchMap, stumpingMap, runOutMap };
}

/**
 * Parse a full Stumps match-report PDF text.
 * Returns null if the text doesn't look like a valid report.
 */
function parseMatchPdf(text) {
  const lines = text.split('\n');

  // ── Match Information block ─────────────────────────────────────────────
  const info = {};
  let inInfo = false;
  for (const line of lines) {
    if (/Match Information/.test(line))  { inInfo = true;  continue; }
    if (inInfo && /Match Summary/.test(line)) break;
    if (!inInfo) continue;
    // Lines look like:  "     Club                    Fcc Sydney"
    const m = line.match(/^\s{3,}([\w &]+?)\s{3,}(.+?)\s*$/);
    if (m) info[m[1].trim()] = m[2].trim();
  }

  if (!info['Match ID']) return null;

  // ── Winner line ─────────────────────────────────────────────────────────
  // The result text sits on the same PDF line as the score, separated by wide
  // whitespace. Split on 2+ spaces and pick the segment that contains the result.
  let resultLine = '';
  const rawResultLine = lines.find(l => /\bwon by\b|\bno result\b|\btied\b/i.test(l));
  if (rawResultLine) {
    const segments = rawResultLine.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    resultLine = segments.find(s => /\bwon by\b|\bno result\b|\btied\b/i.test(s)) ?? rawResultLine.trim();
  }

  // ── Innings blocks ───────────────────────────────────────────────────────
  const MARKERS = ['1st Innings Scorecard', '2nd Innings Scorecard', 'Over Comparison'];
  const positions = MARKERS.map(m => lines.findIndex(l => l.includes(m)));

  if (positions[0] === -1 || positions[1] === -1) return null;

  const block1 = lines.slice(positions[0], positions[1] !== -1 ? positions[1] : lines.length);
  const block2 = lines.slice(positions[1], positions[2] !== -1 ? positions[2] : lines.length);

  const innings1 = parseInnings(block1);
  const innings2 = parseInnings(block2);

  if (!innings1.teamName || !innings2.teamName) return null;

  return {
    externalId: info['Match ID'],
    title:      info['Match Title']  ?? '',
    venue:      info['Venue']        ?? '',
    date:       parseMatchDate(info['Date & Time'] ?? ''),
    format:     info['Match Format'] ?? 'custom',
    overs:      parseInt(info['Overs'] ?? '0') || 0,
    tossText:   info['Toss']         ?? '',
    result:     resultLine,
    innings1,
    innings2,
  };
}

function parseMatchDate(str) {
  if (!str) return new Date();
  try { return new Date(str); }
  catch { return new Date(); }
}

/** All unique player names across both innings. */
function collectPlayerNames(matchData) {
  const names = new Set();
  for (const inn of [matchData.innings1, matchData.innings2]) {
    for (const b of inn.batting)  names.add(b.name);
    for (const b of inn.bowling)  names.add(b.name);
    // Also add names mentioned as fielders in dismissals
    for (const name of Object.keys(inn.catchMap))    names.add(name);
    for (const name of Object.keys(inn.stumpingMap)) names.add(name);
    for (const name of Object.keys(inn.runOutMap))   names.add(name);
  }
  return [...names];
}

// ─── Club selection ───────────────────────────────────────────────────────────

async function selectClub() {
  const snap = await db.collection('clubs').get();
  if (snap.empty) {
    console.error('\nNo clubs found. Create a club in the app first.');
    process.exit(1);
  }

  const clubs = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => !c.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log('\nActive clubs:');
  clubs.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}  (${c.id})`));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('\nSelect club number: ', (ans) => {
      rl.close();
      const idx = parseInt(ans) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= clubs.length) {
        console.error('Invalid selection.');
        process.exit(1);
      }
      resolve(clubs[idx]);
    });
  });
}

// ─── Ghost player upsert ──────────────────────────────────────────────────────

/**
 * Find existing players or create new ghost players for all given display names.
 * Matching is case-insensitive on displayName.
 * Returns Map<normalizedName, playerId>.
 */
async function findOrCreateGhosts(clubId, names, dryRun) {
  const playersRef = db.collection('clubs').doc(clubId).collection('players');
  const snap = await playersRef.get();

  // Map lowercase displayName → { id, displayName }
  const existing = new Map();
  for (const doc of snap.docs) {
    const dn = (doc.data().displayName ?? '').toLowerCase().trim();
    if (dn) existing.set(dn, { id: doc.id, displayName: doc.data().displayName });
  }

  const nameToId = new Map();

  for (const name of names) {
    const key = name.toLowerCase().trim();
    if (existing.has(key)) {
      const p = existing.get(key);
      nameToId.set(name, p.id);
      console.log(`  found    ${name}  →  ${p.id}`);
    } else {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const newId = `ghost-${slug}`;
      const ghostDoc = {
        id: newId,
        displayName: name,
        type: 'ghost',
        activeClaim: null,
        careerStats: {
          totalRuns: 0, totalWickets: 0, totalBallsFaced: 0, totalDismissals: 0,
          totalBallsBowled: 0, totalRunsConceded: 0, totalCatches: 0,
          totalRunOuts: 0, totalStumpings: 0, highScore: 0, matchesPlayed: 0,
        },
      };

      if (!dryRun) {
        // Use set so it's idempotent (same name → same id across runs)
        await playersRef.doc(newId).set(ghostDoc, { merge: false });
      }
      nameToId.set(name, newId);
      existing.set(key, { id: newId, displayName: name }); // avoid duplicates in same run
      console.log(`  created  ${name}  →  ${newId}${dryRun ? '  (dry run)' : ''}`);
    }
  }

  return nameToId;
}

// ─── Per-player stats computation ────────────────────────────────────────────

function mergeCounts(...maps) {
  const out = {};
  for (const m of maps) for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** Compute the stat delta for every player in the match. */
function computeStats(matchData, nameToId) {
  const stats = new Map(); // playerId → delta

  const get = (id) => {
    if (!stats.has(id)) {
      stats.set(id, {
        runs: 0, ballsFaced: 0, dismissed: 0, highScore: 0,
        ballsBowled: 0, runsConceded: 0, wickets: 0,
        catches: 0, stumpings: 0, runOuts: 0,
      });
    }
    return stats.get(id);
  };

  for (const inn of [matchData.innings1, matchData.innings2]) {
    for (const b of inn.batting) {
      const id = nameToId.get(b.name); if (!id) continue;
      const s = get(id);
      s.runs      += b.runs;
      s.ballsFaced += b.balls;
      if (!b.notOut) s.dismissed += 1;
      if (b.runs > s.highScore) s.highScore = b.runs;
    }
    for (const b of inn.bowling) {
      const id = nameToId.get(b.name); if (!id) continue;
      const s = get(id);
      s.ballsBowled    += b.balls;
      s.runsConceded   += b.runs;
      s.wickets        += b.wickets;
    }
  }

  // Fielding credits from both innings
  const allCatches   = mergeCounts(matchData.innings1.catchMap,   matchData.innings2.catchMap);
  const allStumpings = mergeCounts(matchData.innings1.stumpingMap, matchData.innings2.stumpingMap);
  const allRunOuts   = mergeCounts(matchData.innings1.runOutMap,   matchData.innings2.runOutMap);

  for (const [name, cnt] of Object.entries(allCatches)) {
    const id = nameToId.get(name); if (!id) continue;
    get(id).catches += cnt;
  }
  for (const [name, cnt] of Object.entries(allStumpings)) {
    const id = nameToId.get(name); if (!id) continue;
    get(id).stumpings += cnt;
  }
  for (const [name, cnt] of Object.entries(allRunOuts)) {
    const id = nameToId.get(name); if (!id) continue;
    get(id).runOuts += cnt;
  }

  return stats;
}

// ─── Match import ─────────────────────────────────────────────────────────────

/**
 * Convert one parsed innings into the inningsSummary shape the scorecard
 * screen can render when no ball-by-ball overs exist.
 */
function buildInningsSummary(inn, nameToId) {
  const batting = inn.batting
    .map((b) => {
      const id = nameToId.get(b.name);
      if (!id) return null;
      return { id, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, out: !b.notOut };
    })
    .filter(Boolean);

  const bowling = inn.bowling
    .map((b) => {
      const id = nameToId.get(b.name);
      if (!id) return null;
      return { id, balls: b.balls, runs: b.runs, wickets: b.wickets };
    })
    .filter(Boolean);

  const totalRuns = batting.reduce((s, b) => s + b.runs, 0);
  const totalWickets = batting.filter((b) => b.out).length;
  const totalBalls = bowling.reduce((s, b) => s + b.balls, 0);
  const overs = `${Math.floor(totalBalls / 6)}.${totalBalls % 6}`;

  return { batting, bowling, totalRuns, totalWickets, overs };
}

/**
 * Create the match document and update player stats.
 * Returns the new matchId, or null if skipped (duplicate) or dry run.
 */
async function importMatch(clubId, club, matchData, nameToId, dryRun) {
  const matchesRef = db.collection('clubs').doc(clubId).collection('matches');

  // Deduplicate by external match ID
  const dupSnap = await matchesRef
    .where('externalMatchId', '==', matchData.externalId)
    .limit(1)
    .get();
  if (!dupSnap.empty) {
    const existing = dupSnap.docs[0];
    // Backfill inningsSummary on old imports that predate this field.
    if (!existing.data().inningsSummary && !dryRun) {
      await existing.ref.update({
        inningsSummary: {
          '1': buildInningsSummary(matchData.innings1, nameToId),
          '2': buildInningsSummary(matchData.innings2, nameToId),
        },
      });
      console.log(`  backfilled inningsSummary on ${existing.id}  (external: ${matchData.externalId})`);
    } else {
      console.log(`  skip  ${matchData.externalId}  (already imported as ${existing.id})`);
    }
    return null;
  }

  const inn1 = matchData.innings1;
  const inn2 = matchData.innings2;

  // Player ID arrays:
  //   homeTeam (teamA) = 1st-innings batters + 2nd-innings bowlers (same squad)
  //   awayTeam (teamB) = 2nd-innings batters + 1st-innings bowlers (same squad)
  const idsUnion = (...groups) => {
    const seen = new Set();
    return groups.flat().map(p => nameToId.get(p.name)).filter(id => id && !seen.has(id) && seen.add(id));
  };
  const teamAIds = idsUnion(inn1.batting, inn2.bowling);
  const teamBIds = idsUnion(inn2.batting, inn1.bowling);

  // Captains (marked with "(C)" in the PDF)
  const captainAEntry = inn1.batting.find(b => b.isCaptain) ?? inn2.bowling.find(b => b.isCaptain);
  const captainBEntry = inn2.batting.find(b => b.isCaptain) ?? inn1.bowling.find(b => b.isCaptain);
  const captainAId = captainAEntry ? nameToId.get(captainAEntry.name) : undefined;
  const captainBId = captainBEntry ? nameToId.get(captainBEntry.name) : undefined;

  // Toss  —  "Team Name Opted To Bat|Bowl"
  let toss;
  const tossM = matchData.tossText.match(/^(.+?)\s+Opted To\s+(Bat|Bowl)\s*$/i);
  if (tossM) {
    const tossWinnerName = tossM[1].trim();
    const choice = tossM[2].toLowerCase() === 'bat' ? 'bat' : 'field';
    // homeTeam = inn1 team = teamA
    const winnerId = tossWinnerName === inn1.teamName ? 'homeTeam' : 'awayTeam';
    toss = { winnerId, winnerName: tossWinnerName, choice };
  }

  // Winner — check which team name appears in the result string
  let winnerTeam = 'tie';
  if (matchData.result) {
    if (matchData.result.includes(inn1.teamName))      winnerTeam = 'A';
    else if (matchData.result.includes(inn2.teamName)) winnerTeam = 'B';
  }

  // Format
  const FORMAT_MAP = { T20: 'T20', ODI: 'ODI' };
  const format = FORMAT_MAP[matchData.format] ?? 'custom';

  const matchDoc = {
    clubId,
    homeTeam:  inn1.teamName,
    awayTeam:  inn2.teamName,
    date:      Timestamp.fromDate(matchData.date),
    format,
    status:    'completed',
    rules:     club.rules,
    squad:     [...teamAIds, ...teamBIds],
    teamA:     teamAIds,
    teamB:     teamBIds,
    ...(matchData.venue  && { venue:  matchData.venue }),
    ...(captainAId && { captainA: captainAId }),
    ...(captainBId && { captainB: captainBId }),
    ...(toss       && { toss }),
    winnerTeam,
    ...(matchData.result && { result: matchData.result }),
    externalMatchId: matchData.externalId,
    // Tells onMatchCompleted Cloud Function to skip re-aggregation.
    statsAggregated: true,
    // Pre-built scorecard for the app (no ball-by-ball overs stored for imports).
    inningsSummary: {
      '1': buildInningsSummary(inn1, nameToId),
      '2': buildInningsSummary(inn2, nameToId),
    },
  };

  if (dryRun) {
    console.log(`  would create match  ${matchData.externalId}`);
    console.log(`    ${inn1.teamName} (${teamAIds.length}p) vs ${inn2.teamName} (${teamBIds.length}p)`);
    console.log(`    ${format} | ${matchData.overs} overs | ${matchData.date.toDateString()}`);
    console.log(`    Result: ${matchData.result || '(none)'}`);
    return null;
  }

  const ref = await matchesRef.add(matchDoc);
  console.log(`  created match  ${ref.id}  (external: ${matchData.externalId})`);
  return ref.id;
}

// ─── Career stats + performance update ───────────────────────────────────────

async function applyStats(clubId, matchId, matchData, playerStats, nameToId, dryRun) {
  const playersRef = db.collection('clubs').doc(clubId).collection('players');
  const allIds = [...playerStats.keys()];

  // Read current high scores to correctly apply the MAX rule
  const currentDocs = allIds.length
    ? await db.getAll(...allIds.map(id => playersRef.doc(id)))
    : [];
  const currentHS = new Map(currentDocs.map(d => [d.id, d.data()?.careerStats?.highScore ?? 0]));

  // Build Firestore updates
  const batch = db.batch();

  for (const [id, s] of playerStats) {
    if (dryRun) {
      console.log(
        `  would update ${id}:` +
        `  +${s.runs}r ${s.ballsFaced}b ${s.dismissed ? '(out)' : '(no)'}` +
        `  ${s.ballsBowled}balls ${s.runsConceded}rc ${s.wickets}w` +
        `  ${s.catches}ct ${s.stumpings}st ${s.runOuts}ro`,
      );
      continue;
    }

    const update = {
      'careerStats.matchesPlayed':    FieldValue.increment(1),
      'careerStats.totalRuns':        FieldValue.increment(s.runs),
      'careerStats.totalBallsFaced':  FieldValue.increment(s.ballsFaced),
      'careerStats.totalDismissals':  FieldValue.increment(s.dismissed),
      'careerStats.totalBallsBowled': FieldValue.increment(s.ballsBowled),
      'careerStats.totalRunsConceded':FieldValue.increment(s.runsConceded),
      'careerStats.totalWickets':     FieldValue.increment(s.wickets),
      'careerStats.totalCatches':     FieldValue.increment(s.catches),
      'careerStats.totalRunOuts':     FieldValue.increment(s.runOuts),
      'careerStats.totalStumpings':   FieldValue.increment(s.stumpings),
    };
    if (s.highScore > (currentHS.get(id) ?? 0)) {
      update['careerStats.highScore'] = s.highScore;
    }
    batch.update(playersRef.doc(id), update);
  }

  // Per-match performance rows (powers "Last 5" form chart)
  if (matchId) {
    const matchDate = Timestamp.fromDate(matchData.date);
    const inn1 = matchData.innings1;
    const inn2 = matchData.innings2;
    // teamA = homeTeam = 1st-innings batters + 2nd-innings bowlers
    const teamAIds = new Set(
      [...inn1.batting, ...inn2.bowling].map(p => nameToId.get(p.name)).filter(Boolean),
    );
    for (const [id, s] of playerStats) {
      const opponent = teamAIds.has(id) ? inn2.teamName : inn1.teamName;
      if (!dryRun) {
        batch.set(db.collection('playerPerformances').doc(`${matchId}_${id}`), {
          clubId, matchId, playerId: id,
          opponent, label: opponent,
          runs: s.runs, ballsFaced: s.ballsFaced, wickets: s.wickets,
          notOut: s.ballsFaced > 0 && s.dismissed === 0,
          createdAt: matchDate,
        });
      }
    }
  }

  if (!dryRun) {
    await batch.commit();
    console.log(`  updated ${allIds.length} player stat record(s)`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(SEED_DIR)) {
    console.error(`Seed directory not found: ${SEED_DIR}`);
    process.exit(1);
  }

  // Verify pdftotext is available
  try {
    execSync('which pdftotext', { stdio: 'ignore' });
  } catch {
    console.error('pdftotext not found. Install poppler:  brew install poppler');
    process.exit(1);
  }

  // Prod safety gate
  if (ENV === 'prod' && !DRY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((resolve) => {
      rl.question('\n⚠  Writing to PRODUCTION. Type "yes" to continue: ', (ans) => {
        rl.close();
        if (ans.trim() !== 'yes') { console.log('Aborted.'); process.exit(0); }
        resolve();
      });
    });
  }

  // Discover PDFs
  const pdfs = readdirSync(SEED_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(SEED_DIR, f))
    .sort();

  if (pdfs.length === 0) {
    console.error(`No PDF files found in ${SEED_DIR}`);
    process.exit(1);
  }
  console.log(`\nFound ${pdfs.length} PDF(s) in ${SEED_DIR}`);

  // Club selection
  const club = await selectClub();
  console.log(`\nUsing club: "${club.name}"  (${club.id})`);

  // Parse all PDFs up front
  console.log('\n─── Parsing PDFs ───');
  const matchList = [];
  for (const pdf of pdfs) {
    const filename = path.basename(pdf);
    process.stdout.write(`\n${filename}: `);
    let text;
    try { text = extractText(pdf); }
    catch (e) {
      console.log(`error extracting text — ${e.message}`);
      continue;
    }
    const match = parseMatchPdf(text);
    if (!match) {
      console.log('could not parse (not a Stumps report?)');
      continue;
    }
    console.log(`ID ${match.externalId}  |  ${match.innings1.teamName} vs ${match.innings2.teamName}  |  ${match.date.toDateString()}`);
    console.log(`  result: ${match.result || '(not found)'}`);
    console.log(`  1st innings batters: ${match.innings1.batting.map(b => b.name).join(', ')}`);
    console.log(`  1st innings bowlers: ${match.innings1.bowling.map(b => b.name).join(', ')}`);
    console.log(`  2nd innings batters: ${match.innings2.batting.map(b => b.name).join(', ')}`);
    console.log(`  2nd innings bowlers: ${match.innings2.bowling.map(b => b.name).join(', ')}`);
    matchList.push(match);
  }

  if (matchList.length === 0) {
    console.log('\nNo valid match reports found.');
    process.exit(0);
  }

  // Collect all unique player names across all matches
  const allNames = new Set();
  for (const m of matchList) for (const n of collectPlayerNames(m)) allNames.add(n);
  console.log(`\n─── Players (${allNames.size} unique across ${matchList.length} match(es)) ───`);

  const nameToId = await findOrCreateGhosts(club.id, [...allNames].sort(), DRY);

  // Import each match
  console.log('\n─── Importing matches ───');
  for (const matchData of matchList) {
    console.log(`\nMatch ${matchData.externalId}:`);
    const matchId = await importMatch(club.id, club, matchData, nameToId, DRY);

    // Skip stats if the match was a duplicate (matchId is null and not dry-run)
    if (matchId === null && !DRY) continue;

    const playerStats = computeStats(matchData, nameToId);
    console.log(`  computing stats for ${playerStats.size} player(s)…`);
    await applyStats(club.id, matchId, matchData, playerStats, nameToId, DRY);
  }

  console.log(DRY ? '\nDry run complete — nothing written.' : '\nImport complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFatal:', err?.message ?? err);
  process.exit(1);
});
