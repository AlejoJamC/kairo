/** Compact age of an instant: "now", "5m", "3h", "2d". */
export function formatAge(iso: string | null | undefined, now: number = Date.now()): string | undefined {
  if (!iso) return undefined;
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
