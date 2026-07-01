import { describe, it, expect } from "bun:test";
import {
  computeOperationalSlaTiming,
  isBeforeMinimumResponseWindow,
  DEFAULT_PRIORITY_SLA_SECONDS,
} from "./operational-sla.js";

const P1 = DEFAULT_PRIORITY_SLA_SECONDS.P1; // max 3600s, min 900s, risk 1800s, escalation 2700s

describe("computeOperationalSlaTiming", () => {
  it("returns status 'ok' under 50% of max_response_seconds", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const now = "2026-05-04T10:29:00.000Z"; // 29 min of 60 min max → 48.3%
    const result = computeOperationalSlaTiming({ startAt, config: P1, now });
    expect(result.status).toBe("ok");
    expect(result.percentUsed).toBeLessThan(50);
  });

  it("returns status 'at_risk' between 50% and 100%", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const now = "2026-05-04T10:45:00.000Z"; // 45 of 60 min → 75%
    const result = computeOperationalSlaTiming({ startAt, config: P1, now });
    expect(result.status).toBe("at_risk");
    expect(result.remainingSeconds).toBe(900);
  });

  it("returns status 'breached' over 100%", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const now = "2026-05-04T12:00:00.000Z"; // 2h of 1h max → 200%
    const result = computeOperationalSlaTiming({ startAt, config: P1, now });
    expect(result.status).toBe("breached");
    expect(result.overdueSeconds).toBe(3600);
    expect(result.remainingSeconds).toBe(0);
  });

  it("treats exactly 50% as at_risk (boundary is inclusive of at_risk, not ok)", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const now = "2026-05-04T10:30:00.000Z"; // exactly 50%
    const result = computeOperationalSlaTiming({ startAt, config: P1, now });
    expect(result.status).toBe("at_risk");
  });

  it("treats exactly 100% as at_risk (breached is strictly greater than 100%)", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const now = "2026-05-04T11:00:00.000Z"; // exactly 100%
    const result = computeOperationalSlaTiming({ startAt, config: P1, now });
    expect(result.status).toBe("at_risk");
    expect(result.remainingSeconds).toBe(0);
  });

  it("runs on calendar time — a weekend does not pause the clock", () => {
    // Friday 6pm to Monday 6pm is 72 hours straight through the weekend.
    const startAt = "2026-05-01T18:00:00.000Z"; // Friday
    const now = "2026-05-04T18:00:00.000Z"; // Monday, +72h
    const result = computeOperationalSlaTiming({ startAt, config: DEFAULT_PRIORITY_SLA_SECONDS.P3, now });
    // P3 max is 24h — 72h elapsed with no pause means deeply breached.
    expect(result.elapsedSeconds).toBe(72 * 3600);
    expect(result.status).toBe("breached");
  });

  it("freezes the clock at firstResponseAt instead of continuing to 'now'", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const firstResponseAt = "2026-05-04T10:20:00.000Z"; // responded at 20 min (33%)
    const now = "2026-05-04T14:00:00.000Z"; // long after — should be ignored
    const result = computeOperationalSlaTiming({ startAt, config: P1, now, firstResponseAt });
    expect(result.elapsedSeconds).toBe(1200);
    expect(result.status).toBe("ok");
  });

  it("computes deterministic timing for an already-resolved historical ticket (now = resolved_at)", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const resolvedAt = "2026-05-04T09:59:00.000Z"; // resolved before start? clamp to 0
    const result = computeOperationalSlaTiming({ startAt, config: P1, now: resolvedAt });
    expect(result.elapsedSeconds).toBe(0);
    expect(result.status).toBe("ok");
  });

  it("returns valid ISO timestamps for dueAt/riskAt/escalationAt/minResponseAt", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const result = computeOperationalSlaTiming({ startAt, config: P1, now: startAt });
    expect(result.dueAt).toBe("2026-05-04T11:00:00.000Z");
    expect(result.riskAt).toBe("2026-05-04T10:30:00.000Z");
    expect(result.escalationAt).toBe("2026-05-04T10:45:00.000Z");
    expect(result.minResponseAt).toBe("2026-05-04T10:15:00.000Z");
  });
});

describe("isBeforeMinimumResponseWindow", () => {
  it("returns true before the minimum response time has elapsed", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const now = "2026-05-04T10:10:00.000Z"; // 10 min < 15 min min for P1
    expect(isBeforeMinimumResponseWindow(startAt, P1.minResponseSeconds, now)).toBe(true);
  });

  it("returns false once the minimum response time has elapsed", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const now = "2026-05-04T10:15:00.000Z"; // exactly 15 min
    expect(isBeforeMinimumResponseWindow(startAt, P1.minResponseSeconds, now)).toBe(false);
  });

  it("returns false well after the minimum response time", () => {
    const startAt = "2026-05-04T10:00:00.000Z";
    const now = "2026-05-04T11:00:00.000Z";
    expect(isBeforeMinimumResponseWindow(startAt, P1.minResponseSeconds, now)).toBe(false);
  });
});
