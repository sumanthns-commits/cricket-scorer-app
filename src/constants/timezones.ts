export interface TimezoneOption {
  id: string; // IANA timezone name, e.g. "Australia/Sydney"
  label: string;
}

export const DEFAULT_CLUB_TIMEZONE = 'Australia/Sydney';

// Curated list, not exhaustive — covers Australia/NZ (this app's primary
// audience) plus a handful of other common cricket-playing regions.
export const CLUB_TIMEZONES: TimezoneOption[] = [
  { id: 'Australia/Sydney', label: 'Sydney' },
  { id: 'Australia/Melbourne', label: 'Melbourne' },
  { id: 'Australia/Brisbane', label: 'Brisbane' },
  { id: 'Australia/Adelaide', label: 'Adelaide' },
  { id: 'Australia/Perth', label: 'Perth' },
  { id: 'Australia/Hobart', label: 'Hobart' },
  { id: 'Australia/Darwin', label: 'Darwin' },
  { id: 'Pacific/Auckland', label: 'Auckland' },
  { id: 'Asia/Kolkata', label: 'India' },
  { id: 'Asia/Colombo', label: 'Sri Lanka' },
  { id: 'Asia/Karachi', label: 'Pakistan' },
  { id: 'Asia/Dhaka', label: 'Bangladesh' },
  { id: 'Asia/Dubai', label: 'Dubai' },
  { id: 'Asia/Singapore', label: 'Singapore' },
  { id: 'Africa/Johannesburg', label: 'South Africa' },
  { id: 'Europe/London', label: 'London' },
  { id: 'America/New_York', label: 'New York' },
  { id: 'America/Los_Angeles', label: 'Los Angeles' },
];

export function timezoneLabel(tz: string | undefined): string {
  const resolved = tz ?? DEFAULT_CLUB_TIMEZONE;
  return CLUB_TIMEZONES.find((t) => t.id === resolved)?.label ?? resolved;
}
