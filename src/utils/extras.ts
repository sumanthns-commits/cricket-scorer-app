export interface ExtrasBreakdown {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
}

export function emptyExtras(): ExtrasBreakdown {
  return { wides: 0, noBalls: 0, byes: 0, legByes: 0 };
}

export function totalExtras(e: ExtrasBreakdown): number {
  return e.wides + e.noBalls + e.byes + e.legByes;
}

// "12 (b 4, lb 2, w 4, nb 2)" — zero-value parts omitted; "0" if there are no extras at all.
export function formatExtras(e: ExtrasBreakdown): string {
  const total = totalExtras(e);
  if (total === 0) return '0';
  const parts: string[] = [];
  if (e.byes) parts.push(`b ${e.byes}`);
  if (e.legByes) parts.push(`lb ${e.legByes}`);
  if (e.wides) parts.push(`Wd ${e.wides}`);
  if (e.noBalls) parts.push(`nb ${e.noBalls}`);
  return `${total} (${parts.join(', ')})`;
}
