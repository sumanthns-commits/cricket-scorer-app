import { create } from 'zustand';

// A notification tap or deep link can arrive before the nav tree exists
// (still signed out) or before auth has resolved (cold start,
// getLastNotificationResponseAsync/getInitialURL firing before
// onAuthStateChanged settles) — both cases queue their target here and
// RootNavigator replays it once `user` is truthy and the navigationRef is ready.
export type PendingNav =
  | { screen: 'JoinRequests'; params: { clubId: string } }
  | { screen: 'ClubDetail'; params: { clubId: string } }
  | { screen: 'EditClub'; params: { clubId: string } }
  | { screen: 'MatchScorecard'; params: { clubId: string; matchId: string } }
  | { screen: 'PollResponse'; params: { clubId: string; pollId: string } };

interface PendingNotificationState {
  pending: PendingNav | null;
  setPending: (p: PendingNav) => void;
  clearPending: () => void;
}

export const usePendingNotificationStore = create<PendingNotificationState>((set) => ({
  pending: null,
  setPending: (p) => set({ pending: p }),
  clearPending: () => set({ pending: null }),
}));
