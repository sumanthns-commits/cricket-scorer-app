#!/usr/bin/env node
/**
 * mergeGhostPlayers.mjs
 *
 * Merges one ghost player (source) into another (target) within a club.
 *
 *   - Combines careerStats onto the target player (highScore takes the max)
 *   - Replaces source ID with target ID in all match docs
 *     (squad, teamA, teamB, captainA/B, inningsSummary batting + bowling)
 *   - Re-keys playerPerformances docs (merging stats if both appeared in the
 *     same match)
 *   - Marks the source ghost as type:'linked' so it disappears from selection
 *     (safe to undo manually if needed)
 *
 * Usage:
 *   node scripts/mergeGhostPlayers.mjs [--env emulator|staging|prod]
 */

import { createInterface } from 'readline';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const option = (name, def) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : def; };
const ENV = option('--env', 'emulator');

if (!['emulator', 'staging', 'prod'].includes(ENV)) {
  console.error(`Unknown --env "${ENV}". Use: emulator | staging | prod`);
  process.exit(1);
}

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
    if (!PROJECT_ID) { console.error('Set PROJECT_ID env var for --env prod.'); process.exit(1); }
    break;
}

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

console.log(`\nEnv: ${ENV}  |  Project: ${PROJECT_ID}`);

// ─── Interactive helpers ──────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// ─── Club selection ───────────────────────────────────────────────────────────

async function selectClub() {
  const snap = await db.collection('clubs').get();
  if (snap.empty) { console.error('\nNo clubs found.'); process.exit(1); }
  const clubs = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => !c.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
  console.log('\nActive clubs:');
  clubs.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}  (${c.id})`));
  const ans = await ask('\nSelect club number: ');
  const idx = parseInt(ans) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= clubs.length) {
    console.error('Invalid selection.'); process.exit(1);
  }
  return clubs[idx];
}

async function pickGhost(ghosts, prompt) {
  ghosts.forEach((p, i) =>
    console.log(`  ${i + 1}. ${p.displayName.padEnd(30)} (${p.id})  ${p.careerStats?.matchesPlayed ?? 0} matches`)
  );
  const ans = await ask(prompt);
  const idx = parseInt(ans) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= ghosts.length) {
    console.error('Invalid selection.'); process.exit(1);
  }
  return ghosts[idx];
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

function addCareerStats(a, b) {
  return {
    totalRuns:         (a.totalRuns         ?? 0) + (b.totalRuns         ?? 0),
    totalWickets:      (a.totalWickets      ?? 0) + (b.totalWickets      ?? 0),
    totalBallsFaced:   (a.totalBallsFaced   ?? 0) + (b.totalBallsFaced   ?? 0),
    totalDismissals:   (a.totalDismissals   ?? 0) + (b.totalDismissals   ?? 0),
    totalBallsBowled:  (a.totalBallsBowled  ?? 0) + (b.totalBallsBowled  ?? 0),
    totalRunsConceded: (a.totalRunsConceded ?? 0) + (b.totalRunsConceded ?? 0),
    totalCatches:      (a.totalCatches      ?? 0) + (b.totalCatches      ?? 0),
    totalRunOuts:      (a.totalRunOuts      ?? 0) + (b.totalRunOuts      ?? 0),
    totalStumpings:    (a.totalStumpings    ?? 0) + (b.totalStumpings    ?? 0),
    highScore:         Math.max(a.highScore ?? 0, b.highScore ?? 0),
    matchesPlayed:     (a.matchesPlayed     ?? 0) + (b.matchesPlayed     ?? 0),
    ...((a.fieldingPoints != null || b.fieldingPoints != null)
      ? { fieldingPoints: (a.fieldingPoints ?? 0) + (b.fieldingPoints ?? 0) }
      : {}),
  };
}

// ─── Match doc patching ───────────────────────────────────────────────────────

function replaceInArray(arr, srcId, tgtId) {
  const replaced = arr.map(id => id === srcId ? tgtId : id);
  return [...new Set(replaced)]; // deduplicate if target was already present
}

function replaceInBatting(batting, srcId, tgtId) {
  const out = [];
  let tgtIdx = -1;
  for (const b of batting) {
    if (b.id === tgtId) { tgtIdx = out.length; out.push({ ...b }); }
    else if (b.id === srcId) {
      if (tgtIdx >= 0) {
        // Rare: both IDs in same innings — merge into existing target entry
        out[tgtIdx].runs  += b.runs;
        out[tgtIdx].balls += b.balls;
        out[tgtIdx].fours  = (out[tgtIdx].fours ?? 0) + (b.fours ?? 0);
        out[tgtIdx].sixes  = (out[tgtIdx].sixes ?? 0) + (b.sixes ?? 0);
      } else {
        out.push({ ...b, id: tgtId });
      }
    } else {
      out.push(b);
    }
  }
  return out;
}

function replaceInBowling(bowling, srcId, tgtId) {
  const out = [];
  let tgtIdx = -1;
  for (const b of bowling) {
    if (b.id === tgtId) { tgtIdx = out.length; out.push({ ...b }); }
    else if (b.id === srcId) {
      if (tgtIdx >= 0) {
        out[tgtIdx].balls   += b.balls;
        out[tgtIdx].runs    += b.runs;
        out[tgtIdx].wickets += b.wickets;
      } else {
        out.push({ ...b, id: tgtId });
      }
    } else {
      out.push(b);
    }
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const club = await selectClub();
  console.log(`\nUsing club: "${club.name}"  (${club.id})`);

  // Load ghost players
  const playersSnap = await db.collection('clubs').doc(club.id).collection('players')
    .where('type', '==', 'ghost')
    .get();
  const ghosts = playersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (ghosts.length < 2) {
    console.log('\nNeed at least 2 ghost players to merge.');
    rl.close(); process.exit(0);
  }

  console.log(`\n${ghosts.length} ghost players in this club:`);
  const source = await pickGhost(ghosts, '\nSelect SOURCE player to absorb (will be removed): ');
  const remaining = ghosts.filter(g => g.id !== source.id);
  console.log(`\nSelect TARGET player to keep (source stats will be added to this one):`);
  const target = await pickGhost(remaining, '\nSelect TARGET: ');

  console.log(`\n  Source: "${source.displayName}"  (${source.id})`);
  console.log(`  Target: "${target.displayName}"  (${target.id})`);
  const confirm = await ask('\nType "yes" to proceed: ');
  if (confirm.trim() !== 'yes') { console.log('Aborted.'); rl.close(); process.exit(0); }

  const playersRef = db.collection('clubs').doc(club.id).collection('players');

  // ── 1. Merge careerStats onto target ──────────────────────────────────────
  console.log('\n[1/4] Merging careerStats...');
  const merged = addCareerStats(target.careerStats ?? {}, source.careerStats ?? {});
  await playersRef.doc(target.id).update({ careerStats: merged });
  console.log(`  Done. matchesPlayed: ${source.careerStats?.matchesPlayed ?? 0} + ${target.careerStats?.matchesPlayed ?? 0} → ${merged.matchesPlayed}`);

  // ── 2. Update match docs ───────────────────────────────────────────────────
  console.log('\n[2/4] Patching match docs...');
  const matchesSnap = await db.collection('clubs').doc(club.id).collection('matches').get();
  let matchesUpdated = 0;
  const batch = db.batch();

  for (const matchDoc of matchesSnap.docs) {
    const data = matchDoc.data();
    let changed = false;
    const update = {};

    for (const field of ['squad', 'teamA', 'teamB']) {
      if (Array.isArray(data[field]) && data[field].includes(source.id)) {
        update[field] = replaceInArray(data[field], source.id, target.id);
        changed = true;
      }
    }
    for (const capField of ['captainA', 'captainB']) {
      if (data[capField] === source.id) { update[capField] = target.id; changed = true; }
    }

    const summary = data.inningsSummary;
    if (summary) {
      const newSummary = {};
      let summaryChanged = false;
      for (const [key, inn] of Object.entries(summary)) {
        const newInn = { ...inn };
        if (Array.isArray(inn.batting)) {
          const nb = replaceInBatting(inn.batting, source.id, target.id);
          if (JSON.stringify(nb) !== JSON.stringify(inn.batting)) { newInn.batting = nb; summaryChanged = true; }
        }
        if (Array.isArray(inn.bowling)) {
          const nb = replaceInBowling(inn.bowling, source.id, target.id);
          if (JSON.stringify(nb) !== JSON.stringify(inn.bowling)) { newInn.bowling = nb; summaryChanged = true; }
        }
        newSummary[key] = newInn;
      }
      if (summaryChanged) { update.inningsSummary = newSummary; changed = true; }
    }

    if (changed) { batch.update(matchDoc.ref, update); matchesUpdated++; }
  }
  await batch.commit();
  console.log(`  Updated ${matchesUpdated} match doc(s).`);

  // ── 3. Re-key playerPerformances ──────────────────────────────────────────
  console.log('\n[3/4] Re-keying playerPerformances...');
  const perfSnap = await db.collection('playerPerformances')
    .where('playerId', '==', source.id)
    .where('clubId', '==', club.id)
    .get();

  let perfUpdated = 0;
  if (!perfSnap.empty) {
    const perfBatch = db.batch();
    for (const perfDoc of perfSnap.docs) {
      const data = perfDoc.data();
      const newDocId = `${data.matchId}_${target.id}`;
      const existingSnap = await db.collection('playerPerformances').doc(newDocId).get();
      if (existingSnap.exists) {
        const t = existingSnap.data();
        perfBatch.update(existingSnap.ref, {
          runs:       (t.runs       ?? 0) + (data.runs       ?? 0),
          ballsFaced: (t.ballsFaced ?? 0) + (data.ballsFaced ?? 0),
          wickets:    (t.wickets    ?? 0) + (data.wickets    ?? 0),
        });
      } else {
        perfBatch.set(db.collection('playerPerformances').doc(newDocId), {
          ...data, playerId: target.id,
        });
      }
      perfBatch.delete(perfDoc.ref);
      perfUpdated++;
    }
    await perfBatch.commit();
  }
  console.log(`  Re-keyed ${perfUpdated} performance doc(s).`);

  // ── 4. Mark source as linked ───────────────────────────────────────────────
  console.log('\n[4/4] Marking source ghost as linked...');
  await playersRef.doc(source.id).update({ type: 'linked', linkedTo: target.id });
  console.log(`  "${source.displayName}" → type:linked, linkedTo:"${target.id}"`);

  rl.close();
  console.log('\nMerge complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFatal:', err?.message ?? err);
  rl.close();
  process.exit(1);
});
