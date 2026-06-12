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

/**
 * Season label for a match date, split into two halves of the year:
 *   Apr–Sep → single-year label
 *   Oct–Mar → spanning-year label (e.g. "2025/26")
 * The Summer/Winter word flips by hemisphere; the main cricket season is the
 * half that crosses the New Year (Oct–Mar in N, which is winter there).
 */
export function seasonLabel(date: Date, hemisphere: Hemisphere): string {
  const month = date.getMonth(); // 0 = Jan
  const year = date.getFullYear();
  const isAprToSep = month >= 3 && month <= 8;

  if (isAprToSep) {
    const name = hemisphere === 'N' ? 'Summer' : 'Winter';
    return `${name} ${year}`;
  }

  // Oct–Mar: spans the New Year. Resolve the start year of the span.
  const startYear = month >= 9 ? year : year - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, '0');
  const name = hemisphere === 'N' ? 'Winter' : 'Summer';
  return `${name} ${startYear}/${endYY}`;
}

/**
 * Monotonic sort value for a season (higher = more recent), so sections can be
 * ordered newest-first without parsing the label string. Two buckets per year:
 * Oct–Mar resolves to its start year + 0.5 so it sorts after that year's
 * Apr–Sep half.
 */
export function seasonSortValue(date: Date): number {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month >= 3 && month <= 8) return year;
  const startYear = month >= 9 ? year : year - 1;
  return startYear + 0.5;
}
