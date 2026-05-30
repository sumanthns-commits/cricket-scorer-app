import { create } from 'zustand';

interface ClubState {
  activeClubId: string | null;
  setActiveClubId: (id: string | null) => void;
}

export const useClubStore = create<ClubState>((set) => ({
  activeClubId: null,
  setActiveClubId: (id) => set({ activeClubId: id }),
}));
