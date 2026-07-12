import { create } from 'zustand';

// Which end the wagon wheel is drawn from. 'bowler' = looking from the
// bowler's end toward the batsman (batsman at top); 'batsman' = keeper's
// view, batsman at bottom. Session-only, same as themeStore.
interface WagonViewState {
  bowlerView: boolean;
  toggleWagonView: () => void;
}

export const useWagonViewStore = create<WagonViewState>((set) => ({
  bowlerView: true,
  toggleWagonView: () => set((s) => ({ bowlerView: !s.bowlerView })),
}));
