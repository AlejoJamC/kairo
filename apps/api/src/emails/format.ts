/**
 * Date formatting for transactional emails — KAI-247
 */

const formatter = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Format an ISO timestamp as `"10 de junio de 2026, 15:00"` (es locale). */
export function formatEmailDate(iso: string): string {
  return formatter.format(new Date(iso));
}
