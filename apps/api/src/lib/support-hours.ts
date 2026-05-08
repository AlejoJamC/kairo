// KAI-40: support-hours utilities.
//
// Tenants configure weekly support hours per day in `support_schedules`. This
// module exposes a default schedule (Colombia office hours), the data shape
// stored in DB, and a timezone-aware predicate `isWithinSupportHours`.

export interface SupportScheduleEntry {
  day_of_week: number;   // 0 = Sunday, 6 = Saturday (matches Date.getDay)
  start_time: string;    // "HH:MM" or "HH:MM:SS" — local to `timezone`
  end_time: string;      // "HH:MM" or "HH:MM:SS"
  timezone: string;      // IANA name, e.g. "America/Bogota"
}

// Colombia office hours, used when a tenant has no rows in support_schedules.
// Mon–Fri 08:00–18:00, Sat 08:00–12:00, Sun closed.
export const DEFAULT_SCHEDULE: ReadonlyArray<SupportScheduleEntry> = [
  { day_of_week: 1, start_time: "08:00", end_time: "18:00", timezone: "America/Bogota" },
  { day_of_week: 2, start_time: "08:00", end_time: "18:00", timezone: "America/Bogota" },
  { day_of_week: 3, start_time: "08:00", end_time: "18:00", timezone: "America/Bogota" },
  { day_of_week: 4, start_time: "08:00", end_time: "18:00", timezone: "America/Bogota" },
  { day_of_week: 5, start_time: "08:00", end_time: "18:00", timezone: "America/Bogota" },
  { day_of_week: 6, start_time: "08:00", end_time: "12:00", timezone: "America/Bogota" },
];

function parseHHMM(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

interface TzPartsResult {
  dayOfWeek: number; // 0 = Sun … 6 = Sat
  hour: number;      // 0–23
  minute: number;    // 0–59
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function getZonedParts(now: Date, timezone: string): TzPartsResult | null {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return null;
  }
  const parts = formatter.formatToParts(now);
  let weekday = "";
  let hour = -1;
  let minute = -1;
  for (const p of parts) {
    if (p.type === "weekday") weekday = p.value;
    else if (p.type === "hour") hour = Number(p.value === "24" ? "0" : p.value);
    else if (p.type === "minute") minute = Number(p.value);
  }
  const dayOfWeek = WEEKDAY_INDEX[weekday];
  if (dayOfWeek === undefined || hour < 0 || minute < 0) return null;
  return { dayOfWeek, hour, minute };
}

/**
 * Returns true if `now` falls inside any schedule entry.
 *
 * - An empty `schedule` array means no support hours configured → returns false.
 *   Callers wanting the Colombia default should pass `DEFAULT_SCHEDULE`.
 * - Days with no entry are treated as closed.
 * - Each entry is interpreted in its own `timezone` field.
 * - Half-open interval [start_time, end_time) — end_time is exclusive so a
 *   schedule ending at 18:00 closes exactly at 18:00:00.
 * - Entries where end_time <= start_time (overnight) wrap past midnight: the
 *   active window is [start_time, 24:00) on day_of_week PLUS [00:00, end_time)
 *   on the next day.
 */
export function isWithinSupportHours(
  schedule: ReadonlyArray<SupportScheduleEntry>,
  now: Date = new Date()
): boolean {
  if (schedule.length === 0) return false;

  for (const entry of schedule) {
    const start = parseHHMM(entry.start_time);
    const end = parseHHMM(entry.end_time);
    if (!start || !end) continue;

    const parts = getZonedParts(now, entry.timezone);
    if (!parts) continue;

    const nowMinutes = parts.hour * 60 + parts.minute;
    const startMinutes = start.h * 60 + start.m;
    const endMinutes = end.h * 60 + end.m;

    const isOvernight = endMinutes <= startMinutes;

    if (!isOvernight) {
      if (parts.dayOfWeek === entry.day_of_week &&
          nowMinutes >= startMinutes &&
          nowMinutes < endMinutes) {
        return true;
      }
    } else {
      // Overnight: open [start, 24:00) on entry day OR [00:00, end) next day.
      const nextDay = (entry.day_of_week + 1) % 7;
      if (parts.dayOfWeek === entry.day_of_week && nowMinutes >= startMinutes) return true;
      if (parts.dayOfWeek === nextDay && nowMinutes < endMinutes) return true;
    }
  }

  return false;
}
