#!/usr/bin/env node
/**
 * Seed N ghost players into a club in the Firestore EMULATOR (dev only).
 *
 * Usage:
 *   node scripts/seedPlayers.mjs <clubId> [count]   # seed `count` players (default 11)
 *   node scripts/seedPlayers.mjs --list             # list clubs + their player counts
 *
 * Config (env, with sensible defaults):
 *   PROJECT_ID              default "cricket-scorer-staging"
 *   FIRESTORE_EMULATOR_HOST default "localhost:8080"
 *
 * Players get deterministic ids (seed-1 … seed-N) so re-running is idempotent
 * rather than piling up duplicates. Stats are randomised so the team builder /
 * AI assistant have signal to work with.
 */
// Uses the Admin SDK so it bypasses Firestore security rules (the client SDK
// would be denied now that rules require an authenticated club admin).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.PROJECT_ID ?? 'cricket-scorer-staging';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';
// Admin SDK connects to the emulator (and bypasses rules) when this is set.
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;

const FIRST = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Drew',
  'Pat', 'Charlie', 'Quinn', 'Reese', 'Avery', 'Devon', 'Harper', 'Kai'];
const LAST = ['Sharma', 'Khan', 'Patel', 'Singh', 'Reddy', 'Nair', 'Bose', 'Iyer',
  'Rao', 'Das', 'Gupta', 'Menon', 'Shah', 'Verma', 'Pillai', 'Sen'];

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function makeStats() {
  const ballsFaced = rnd(80, 1200);
  const ballsBowled = rnd(0, 900);
  return {
    totalRuns: rnd(50, 1500),
    totalWickets: rnd(0, 60),
    totalBallsFaced: ballsFaced,
    totalDismissals: rnd(5, 60),
    totalBallsBowled: ballsBowled,
    totalRunsConceded: Math.round(ballsBowled * (rnd(60, 160) / 100)),
    totalCatches: rnd(0, 40),
    totalRunOuts: rnd(0, 15),
    highScore: rnd(15, 150),
    matchesPlayed: rnd(3, 80),
  };
}

async function main() {
  const args = process.argv.slice(2);
  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  if (args[0] === '--list' || args.length === 0) {
    const clubsSnap = await db.collection('clubs').get();
    if (clubsSnap.empty) {
      console.log('No clubs found in the emulator. Create a club in the app first.');
    } else {
      console.log(`Clubs in project "${PROJECT_ID}" (@ ${EMULATOR_HOST}):\n`);
      for (const c of clubsSnap.docs) {
        const playersSnap = await db.collection('clubs').doc(c.id).collection('players').get();
        console.log(`  ${c.id}  "${c.data().name ?? '(no name)'}"  — ${playersSnap.size} player(s)`);
      }
      console.log('\nThen: node scripts/seedPlayers.mjs <clubId> [count]');
    }
    process.exit(0);
  }

  const clubId = args[0];
  const count = Number(args[1] ?? '11');
  if (!Number.isInteger(count) || count < 1) {
    console.error(`Invalid count "${args[1]}". Pass a positive integer.`);
    process.exit(1);
  }

  const BOWLING_STYLES = ['fast', 'medium', 'spin'];
  const playersCol = db.collection('clubs').doc(clubId).collection('players');

  console.log(`Seeding ${count} player(s) into clubs/${clubId}/players  (@ ${EMULATOR_HOST}) ...`);
  for (let i = 1; i <= count; i++) {
    const displayName = `${FIRST[(i - 1) % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const battingHand = Math.random() < 0.3 ? 'LHB' : 'RHB'; // ~30% left-handers
    const bowlingStyle = BOWLING_STYLES[rnd(0, 2)];
    await playersCol.doc(`seed-${i}`).set({
      id: `seed-${i}`,
      displayName,
      type: 'ghost',
      activeClaim: null,
      claimStatus: 'open',
      careerStats: makeStats(),
      skillRating: rnd(40, 95),
      battingHand,
      bowlingStyle,
    });
    console.log(`  seed-${i}  ${displayName}  (${battingHand}, ${bowlingStyle})`);
  }

  const playersSnap = await playersCol.get();
  console.log(`\nDone. clubs/${clubId} now has ${playersSnap.size} player(s) total.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err?.message ?? err);
  console.error('Is the emulator running and is the clubId correct? Try: node scripts/seedPlayers.mjs --list');
  process.exit(1);
});
