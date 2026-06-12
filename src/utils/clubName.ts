// Normalises a club name to a stable key used to enforce uniqueness across the
// (otherwise per-member-private) clubs collection via the `clubNames` registry.
// Case- and punctuation-insensitive so "St. Mary's CC" and "St Marys CC" clash.
export function normalizeClubName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
