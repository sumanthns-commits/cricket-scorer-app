// Canonical fielding positions, clockwise from 0 = straight (toward bowler).
// Keeper's view (batsman at bottom): RHB off side = right (sectors 1–5),
// leg side = left (sectors 7–11). Single source of truth for both the wagon
// wheel capture UI (LiveScoring) and commentary text (services/commentary) —
// they must never diverge, since a scorer taps a position here and it needs
// to read back the same way in commentary.
export const RHB_WAGON_LABELS = [
  'Straight', 'Mid-off', 'Cover', 'Point', 'Gully', 'Third man',
  'Behind', 'Fine leg', 'Bwd sq leg', 'Sq. leg', 'Midwicket', 'Mid-on',
];
// LHB: mirror of RHB across the vertical axis (sector i ↔ 12 − i).
export const LHB_WAGON_LABELS = [
  'Straight', 'Mid-on', 'Midwicket', 'Sq. leg', 'Bwd sq leg', 'Fine leg',
  'Behind', 'Third man', 'Gully', 'Point', 'Cover', 'Mid-off',
];

export function wagonLabelFor(sector: number, isLHB: boolean): string {
  const labels = isLHB ? LHB_WAGON_LABELS : RHB_WAGON_LABELS;
  return labels[((sector % 12) + 12) % 12];
}
