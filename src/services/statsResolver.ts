import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  documentId,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Player, Claim, ResolvedStats } from '../types';

export async function resolvePlayerStats(
  clubId: string,
  playerId: string
): Promise<ResolvedStats> {
  const snap = await getDoc(doc(db, 'clubs', clubId, 'players', playerId));
  if (!snap.exists()) throw new Error(`Player ${playerId} not found`);

  const player = { id: snap.id, ...snap.data() } as Player;

  if (player.type !== 'ghost') {
    return { playerId, stats: player.careerStats, statsSource: 'live' };
  }

  const claimsSnap = await getDocs(
    query(
      collection(db, 'clubs', clubId, 'claims'),
      where('ghostId', '==', playerId),
      where('status', 'in', ['cooldown', 'contested', 'waiting'])
    )
  );

  if (claimsSnap.empty) {
    return { playerId, stats: player.careerStats, statsSource: 'snapshot' };
  }

  const claim = claimsSnap.docs[0].data() as Claim;
  return { playerId, stats: claim.snapshot.ghostStats, statsSource: 'snapshot' };
}

export async function resolveSquadStats(
  clubId: string,
  playerIds: string[]
): Promise<Record<string, ResolvedStats>> {
  if (playerIds.length === 0) return {};

  // Round 1: batch-fetch all player docs by document ID
  const playersSnap = await getDocs(
    query(
      collection(db, 'clubs', clubId, 'players'),
      where(documentId(), 'in', playerIds)
    )
  );

  const players = new Map<string, Player>();
  const ghostIds: string[] = [];

  for (const d of playersSnap.docs) {
    const player = { id: d.id, ...d.data() } as Player;
    players.set(d.id, player);
    if (player.type === 'ghost') ghostIds.push(d.id);
  }

  // Round 2: batch-fetch active claims for every ghost in the squad
  const claimsByGhostId = new Map<string, Claim>();
  const claimantToGhostId = new Map<string, string>();

  if (ghostIds.length > 0) {
    const claimsSnap = await getDocs(
      query(
        collection(db, 'clubs', clubId, 'claims'),
        where('ghostId', 'in', ghostIds),
        where('status', 'in', ['cooldown', 'contested', 'waiting'])
      )
    );

    for (const d of claimsSnap.docs) {
      const claim = d.data() as Claim;
      claimsByGhostId.set(claim.ghostId, claim);
      claimantToGhostId.set(claim.claimantId, claim.ghostId);
    }
  }

  // Suppress a ghost when its claimant appears in the same squad
  const suppressedGhostIds = new Set<string>();
  for (const [claimantId, ghostId] of claimantToGhostId) {
    if (players.has(claimantId)) suppressedGhostIds.add(ghostId);
  }

  const result: Record<string, ResolvedStats> = {};

  for (const [playerId, player] of players) {
    if (suppressedGhostIds.has(playerId)) continue;

    if (player.type === 'ghost') {
      const claim = claimsByGhostId.get(playerId);
      result[playerId] = {
        playerId,
        stats: claim?.snapshot.ghostStats ?? player.careerStats,
        statsSource: 'snapshot',
      };
    } else {
      result[playerId] = { playerId, stats: player.careerStats, statsSource: 'live' };
    }
  }

  return result;
}
