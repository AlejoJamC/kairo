// Cron's minute-field step (`*/N`) only accepts N <= 59 — a value of 60+
// (e.g. 720 for "every 12 hours") is not representable there. For any
// interval that's a whole number of hours, step the hour field instead.
export function buildIntervalCronExpression(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    return `0 */${minutes / 60} * * *`;
  }
  return `*/${Math.min(minutes, 59)} * * * *`;
}
