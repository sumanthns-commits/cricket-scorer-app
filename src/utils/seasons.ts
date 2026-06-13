import * as Localization from 'expo-localization';

export type Hemisphere = 'N' | 'S';

// Country codes whose bulk of territory sits in the southern hemisphere.
// Best-effort: only used to pre-fill the CreateClub toggle, which is overridable.
const SOUTHERN_REGIONS = new Set([
  'AU', 'NZ', 'ZA', 'ZW', 'NA', 'BW', 'MZ', 'MW', 'ZM', 'AO', 'MG',
  'AR', 'CL', 'UY', 'PY', 'BO', 'PE', 'BR', 'FJ', 'PG', 'WS',
]);

/**
 * Best-effort hemisphere from the device region (no permission prompt).
 * Falls back to 'N' when the region is unknown or northern.
 */
export function detectHemisphere(): Hemisphere {
  const region = Localization.getLocales()[0]?.regionCode ?? '';
  return SOUTHERN_REGIONS.has(region.toUpperCase()) ? 'S' : 'N';
}

// NH season name by month index (0=Jan … 11=Dec).
// Dec–Feb is the NH winter bucket and spans the new year.
const NH_SEASON = [
  'Winter', 'Winter', 'Spring', 'Spring', 'Spring',
  'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter',
] as const;
type SeasonName = (typeof NH_SEASON)[number];

// SH names are the opposite of NH names.
const SH_FLIP: Record<SeasonName, SeasonName> = {
  Winter: 'Summer', Summer: 'Winter', Spring: 'Autumn', Autumn: 'Spring',
};

// Monotonic offset within a year: Spring < Summer < Autumn < Winter.
const SEASON_OFFSET: Record<SeasonName, number> = {
  Spring: 0.0, Summer: 0.25, Autumn: 0.5, Winter: 0.75,
};

function resolveNH(month: number, year: number): { nhSeason: SeasonName; startYear: number; spansNewYear: boolean } {
  const nhSeason = NH_SEASON[month];
  // Dec–Jan–Feb (Winter/NH) spans the new year; Dec is the start month.
  const spansNewYear = nhSeason === 'Winter';
  const startYear = spansNewYear ? (month === 11 ? year : year - 1) : year;
  return { nhSeason, startYear, spansNewYear };
}

/**
 * Season label for a match date. Four seasons per year; the winter bucket
 * (Dec–Feb) spans the new year and uses a "2025/26" suffix.
 * Southern hemisphere flips Summer↔Winter and Spring↔Autumn.
 */
export function seasonLabel(date: Date, hemisphere: Hemisphere): string {
  const { nhSeason, startYear, spansNewYear } = resolveNH(date.getMonth(), date.getFullYear());
  const name = hemisphere === 'N' ? nhSeason : SH_FLIP[nhSeason];

  if (spansNewYear) {
    const endYY = String((startYear + 1) % 100).padStart(2, '0');
    return `${name} ${startYear}/${endYY}`;
  }
  return `${name} ${startYear}`;
}

/** Season label for today — used to default selectors to the current season. */
export function currentSeasonLabel(hemisphere: Hemisphere): string {
  return seasonLabel(new Date(), hemisphere);
}

/**
 * Monotonic sort value for a season (higher = more recent).
 * Four buckets per year, ordered Spring → Summer → Autumn → Winter.
 * Hemisphere-independent — chronological order of dates doesn't change.
 */
export function seasonSortValue(date: Date): number {
  const { nhSeason, startYear } = resolveNH(date.getMonth(), date.getFullYear());
  return startYear + SEASON_OFFSET[nhSeason];
}
