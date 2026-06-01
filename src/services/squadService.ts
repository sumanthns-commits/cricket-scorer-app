import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { CareerStats, Player, PlayerType } from '../types';

export interface SquadEntry {
  player: Player;
  role: 'admin' | 'member';
}

const emptyStats: CareerStats = {
  totalRuns: 0,
  totalWickets: 0,
  totalBallsFaced: 0,
  totalDismissals: 0,
  totalBallsBowled: 0,
  totalRunsConceded: 0,
  totalCatches: 0,
  totalRunOuts: 0,
  highScore: 0,
  matchesPlayed: 0,
};

/**
 * All players in a club's squad, enriched with their membership role.
 * Ghost docs carry their own displayName/stats; registered-member docs carry a
 * role and we resolve the display name from /users/{id}.
 */
export async function getClubSquad(clubId: string): Promise<SquadEntry[]> {
  const snap = await getDocs(collection(db, 'clubs', clubId, 'players'));
  const entries: SquadEntry[] = [];

  for (const d of snap.docs) {
    const data = d.data();
    const role: 'admin' | 'member' = data.role === 'admin' ? 'admin' : 'member';

    if (data.displayName) {
      entries.push({ player: { id: d.id, ...data } as Player, role });
      continue;
    }

    // Registered member doc — resolve profile from /users/{id}
    const userSnap = await getDoc(doc(db, 'users', d.id));
    const userData = userSnap.exists() ? userSnap.data() : null;
    entries.push({
      player: {
        id: d.id,
        displayName: userData?.displayName ?? d.id,
        type: (data.type as PlayerType) ?? 'registered',
        activeClaim: data.activeClaim ?? null,
        careerStats: (data.careerStats as CareerStats) ?? emptyStats,
        photoURL: userData?.photoURL,
        skillRating: data.skillRating,
      },
      role,
    });
  }

  return entries;
}
