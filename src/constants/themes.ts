export type Theme = {
  id: string;
  name: string;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  accent: string;
  accentDim: string;
  text: string;
  textSecondary: string;
  textMuted: string;
};

export const THEMES: Theme[] = [
  {
    id: 'dark',
    name: 'Dark',
    bg: '#0a1628',
    surface: '#1e2d45',
    surfaceAlt: '#162236',
    border: '#2d3f58',
    accent: '#4ade80',
    accentDim: '#166534',
    text: '#ffffff',
    textSecondary: '#d1d5db',
    textMuted: '#6b7280',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    bg: '#0d0f14',
    surface: '#1a1f2e',
    surfaceAlt: '#141824',
    border: '#2a3147',
    accent: '#60a5fa',
    accentDim: '#1e3a5f',
    text: '#f1f5f9',
    textSecondary: '#cbd5e1',
    textMuted: '#64748b',
  },
  {
    id: 'forest',
    name: 'Forest',
    bg: '#0b1a0e',
    surface: '#162b1a',
    surfaceAlt: '#112214',
    border: '#1e4023',
    accent: '#34d399',
    accentDim: '#064e3b',
    text: '#f0fdf4',
    textSecondary: '#bbf7d0',
    textMuted: '#4ade80',
  },
  {
    id: 'crimson',
    name: 'Crimson',
    bg: '#160a0a',
    surface: '#2a1010',
    surfaceAlt: '#1f0c0c',
    border: '#3d1515',
    accent: '#f97316',
    accentDim: '#7c2d12',
    text: '#fff7ed',
    textSecondary: '#fed7aa',
    textMuted: '#9a3412',
  },
  {
    id: 'violet',
    name: 'Violet',
    bg: '#100a1e',
    surface: '#1e1233',
    surfaceAlt: '#170e28',
    border: '#2e1d4e',
    accent: '#a78bfa',
    accentDim: '#4c1d95',
    text: '#faf5ff',
    textSecondary: '#ddd6fe',
    textMuted: '#7c3aed',
  },
];

export const DEFAULT_THEME = THEMES[0];
