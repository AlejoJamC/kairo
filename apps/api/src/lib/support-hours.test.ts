import { describe, it, expect } from "bun:test";
import {
  isWithinSupportHours,
  DEFAULT_SCHEDULE,
  type SupportScheduleEntry,
} from "./support-hours.js";

const BOGOTA = "America/Bogota";

// Bogota is UTC-5 year-round (no DST). 14:00 UTC = 09:00 Bogota.
const monBogota10am = new Date("2026-05-04T15:00:00Z"); // Mon 10:00 Bogota
const monBogota18 = new Date("2026-05-04T23:00:00Z");   // Mon 18:00 Bogota — closed (exclusive end)
const monBogota1759 = new Date("2026-05-04T22:59:00Z"); // Mon 17:59 Bogota — open
const monBogota7am = new Date("2026-05-04T12:00:00Z");  // Mon 07:00 Bogota — closed
const sunBogota10am = new Date("2026-05-03T15:00:00Z"); // Sun 10:00 Bogota — closed
const satBogota10am = new Date("2026-05-09T15:00:00Z"); // Sat 10:00 Bogota — open in default
const satBogota13 = new Date("2026-05-09T18:00:00Z");   // Sat 13:00 Bogota — closed in default

describe("isWithinSupportHours — DEFAULT_SCHEDULE (Colombia)", () => {
  it("returns true Mon 10:00 Bogota", () => {
    expect(isWithinSupportHours(DEFAULT_SCHEDULE, monBogota10am)).toBe(true);
  });

  it("returns true Mon 17:59 Bogota (just before close)", () => {
    expect(isWithinSupportHours(DEFAULT_SCHEDULE, monBogota1759)).toBe(true);
  });

  it("returns false Mon 18:00 Bogota (exclusive end)", () => {
    expect(isWithinSupportHours(DEFAULT_SCHEDULE, monBogota18)).toBe(false);
  });

  it("returns false Mon 07:00 Bogota (before open)", () => {
    expect(isWithinSupportHours(DEFAULT_SCHEDULE, monBogota7am)).toBe(false);
  });

  it("returns false Sunday (no entry)", () => {
    expect(isWithinSupportHours(DEFAULT_SCHEDULE, sunBogota10am)).toBe(false);
  });

  it("returns true Sat 10:00 (8-12 window)", () => {
    expect(isWithinSupportHours(DEFAULT_SCHEDULE, satBogota10am)).toBe(true);
  });

  it("returns false Sat 13:00 (after Saturday close)", () => {
    expect(isWithinSupportHours(DEFAULT_SCHEDULE, satBogota13)).toBe(false);
  });
});

describe("isWithinSupportHours — empty / invalid schedule", () => {
  it("returns false for empty schedule", () => {
    expect(isWithinSupportHours([], new Date())).toBe(false);
  });

  it("ignores entries with malformed times", () => {
    const bad: SupportScheduleEntry[] = [
      { day_of_week: 1, start_time: "abc", end_time: "18:00", timezone: BOGOTA },
    ];
    expect(isWithinSupportHours(bad, monBogota10am)).toBe(false);
  });

  it("ignores entries with invalid timezone", () => {
    const bad: SupportScheduleEntry[] = [
      { day_of_week: 1, start_time: "08:00", end_time: "18:00", timezone: "Not/A_Zone" },
    ];
    expect(isWithinSupportHours(bad, monBogota10am)).toBe(false);
  });
});

describe("isWithinSupportHours — overnight (crosses midnight)", () => {
  // Friday 22:00 → Saturday 06:00 in Bogota.
  const friNightSchedule: SupportScheduleEntry[] = [
    { day_of_week: 5, start_time: "22:00", end_time: "06:00", timezone: BOGOTA },
  ];

  it("returns true Friday 23:00 Bogota", () => {
    const friday23 = new Date("2026-05-09T04:00:00Z"); // Fri May 8 23:00 Bogota
    expect(isWithinSupportHours(friNightSchedule, friday23)).toBe(true);
  });

  it("returns true Saturday 02:00 Bogota (carryover)", () => {
    const sat2am = new Date("2026-05-09T07:00:00Z"); // Sat 02:00 Bogota
    expect(isWithinSupportHours(friNightSchedule, sat2am)).toBe(true);
  });

  it("returns false Saturday 07:00 Bogota (after end)", () => {
    const sat7am = new Date("2026-05-09T12:00:00Z"); // Sat 07:00 Bogota
    expect(isWithinSupportHours(friNightSchedule, sat7am)).toBe(false);
  });

  it("returns false Friday 21:00 Bogota (before start)", () => {
    const fri21 = new Date("2026-05-09T02:00:00Z"); // Fri 21:00 Bogota
    expect(isWithinSupportHours(friNightSchedule, fri21)).toBe(false);
  });
});

describe("isWithinSupportHours — DST handling (Europe/Madrid)", () => {
  // Madrid switches to CEST (UTC+2) on Mar 30, 2026.
  // Schedule: Mon 09:00–17:00 Madrid local.
  const madridSchedule: SupportScheduleEntry[] = [
    { day_of_week: 1, start_time: "09:00", end_time: "17:00", timezone: "Europe/Madrid" },
  ];

  it("during CET (UTC+1) — Mon 10:00 Madrid = 09:00 UTC → open", () => {
    const monBeforeDst = new Date("2026-03-23T09:00:00Z"); // Mon Mar 23 — CET
    expect(isWithinSupportHours(madridSchedule, monBeforeDst)).toBe(true);
  });

  it("during CEST (UTC+2) — Mon 10:00 Madrid = 08:00 UTC → open", () => {
    const monAfterDst = new Date("2026-04-06T08:00:00Z"); // Mon Apr 6 — CEST
    expect(isWithinSupportHours(madridSchedule, monAfterDst)).toBe(true);
  });

  it("during CEST — UTC time that would be open in CET but closed in CEST", () => {
    // 07:00 UTC = 09:00 CEST (open) but = 08:00 CET (closed before DST).
    const monApr6 = new Date("2026-04-06T07:00:00Z"); // Mon 09:00 CEST
    expect(isWithinSupportHours(madridSchedule, monApr6)).toBe(true);
  });
});

describe("isWithinSupportHours — multi-timezone schedule", () => {
  // One tenant with two entries in different timezones (rare but legal).
  const multi: SupportScheduleEntry[] = [
    { day_of_week: 1, start_time: "09:00", end_time: "17:00", timezone: BOGOTA },
    { day_of_week: 1, start_time: "09:00", end_time: "17:00", timezone: "Asia/Tokyo" },
  ];

  it("matches if any entry's timezone window is open", () => {
    // 06:00 UTC Monday = 15:00 Tokyo (open) and 01:00 Bogota Mon (closed).
    const t = new Date("2026-05-04T06:00:00Z");
    expect(isWithinSupportHours(multi, t)).toBe(true);
  });
});
