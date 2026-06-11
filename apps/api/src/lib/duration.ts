/**
 * Duration humanizer — KAI-247
 *
 * Formats the elapsed time between two ISO timestamps as a short, human
 * readable string for `{{time_to_resolve}}` (e.g. "45m", "4h 12m", "2d 3h").
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Humanize the elapsed time between `fromIso` and `toIso`, e.g. "4h 12m". */
export function humanizeDuration(fromIso: string, toIso: string): string {
  const diffMs = Math.max(0, new Date(toIso).getTime() - new Date(fromIso).getTime());

  const days = Math.floor(diffMs / DAY_MS);
  const hours = Math.floor((diffMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diffMs % HOUR_MS) / MINUTE_MS);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
