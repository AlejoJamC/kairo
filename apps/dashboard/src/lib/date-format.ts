// Dates are always day, month, year (and 24-hour time), whatever the interface language or the
// browser locale: the same instant never reads two ways.

const pad = (value: number) => String(value).padStart(2, "0");

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 20/06/2026 */
export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : "—";
}

/** 20/06/2026 22:07 */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? `${formatDate(iso)} ${pad(date.getHours())}:${pad(date.getMinutes())}` : "—";
}

/** 06/2026 */
export function formatMonthYear(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? `${pad(date.getMonth() + 1)}/${date.getFullYear()}` : "—";
}
