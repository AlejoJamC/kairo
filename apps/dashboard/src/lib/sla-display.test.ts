import { describe, expect, it } from "vitest";
import { DEFAULT_PRIORITY_SLA_SECONDS, computeOperationalSlaTiming } from "@kairo/types";
import { formatCompactDuration, formatDuration, slaDisplay } from "./sla-display";

const START = "2026-01-01T00:00:00.000Z";
const config = DEFAULT_PRIORITY_SLA_SECONDS.P1; // max 3600, alert 1800, escalation 2700

function at(seconds: number) {
  const now = new Date(new Date(START).getTime() + seconds * 1000);
  return { timing: computeOperationalSlaTiming({ startAt: START, config, now: now.toISOString() }), nowMs: now.getTime() };
}

describe("slaDisplay", () => {
  it.each([
    [600, "onTime"],
    [1800, "atRisk"],
    [2700, "escalating"],
    [3600, "overdue"],
    [7200, "overdue"],
  ] as const)("at %is the state is %s", (seconds, status) => {
    const { timing, nowMs } = at(seconds);
    expect(slaDisplay(timing, nowMs).status).toBe(status);
  });

  it("counts down to the maximum and up once overdue", () => {
    const early = at(2400);
    expect(slaDisplay(early.timing, early.nowMs).seconds).toBe(1200);
    const late = at(3900);
    expect(slaDisplay(late.timing, late.nowMs).seconds).toBe(300);
  });
});

describe("durations", () => {
  it("formats the full duration and the compact one", () => {
    expect(formatDuration(90 * 60)).toBe("1h 30m");
    expect(formatDuration(153 * 86400 + 22 * 3600 + 13 * 60)).toBe("153d 22h 13m");
    expect(formatCompactDuration(2400)).toBe("40m");
    expect(formatCompactDuration(7800)).toBe("2h");
    expect(formatCompactDuration(153 * 86400)).toBe("153d");
  });
});
