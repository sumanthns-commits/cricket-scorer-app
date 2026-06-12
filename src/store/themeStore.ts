import { create } from 'zustand';
import { THEMES, DEFAULT_THEME, type Theme } from '../constants/themes';

interface ThemeState {
  theme: Theme;
  setTheme: (id: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: DEFAULT_THEME,
  setTheme: (id) => {
    const found = THEMES.find((t) => t.id === id);
    if (found) set({ theme: found });
  },
}));
