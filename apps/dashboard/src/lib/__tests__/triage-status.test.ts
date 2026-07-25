import { describe, it, expect } from "vitest";
import { isTriageActive, TRIAGE_COUNTED_STATUSES } from "../triage-status";

// ---------------------------------------------------------------------------
// Regression: the triage list and the aside badge used to declare "triage"
// separately (a blacklist vs a hardcoded ["open"] whitelist). They drifted —
// an in_progress ticket showed in the list but was counted by no badge, so the
// list read 8/8 while the aside read 7. These pin both sides to one mapping.
// ---------------------------------------------------------------------------

describe("isTriageActive", () => {
  it("keeps every worked status in the triage queue", () => {
    for (const status of ["open", "in_progress", "guided", "reopened"]) {
      expect(isTriageActive(status)).toBe(true);
    }
  });

  it("drops awaiting and final statuses out of the queue", () => {
    for (const status of ["awaiting_customer", "resolved", "auto_resolved"]) {
      expect(isTriageActive(status)).toBe(false);
    }
  });

  it("drops escalated out of the queue — it has its own view (Escalado)", () => {
    expect(isTriageActive("escalated")).toBe(false);
  });

  it("treats an unknown or missing status as active, never hiding a ticket", () => {
    expect(isTriageActive("some_future_status")).toBe(true);
    expect(isTriageActive(null)).toBe(true);
    expect(isTriageActive(undefined)).toBe(true);
  });
});

describe("TRIAGE_COUNTED_STATUSES", () => {
  it("counts in_progress — the status that used to fall through uncounted", () => {
    expect(TRIAGE_COUNTED_STATUSES).toContain("in_progress");
  });

  it("counts every worked status, not just open", () => {
    expect([...TRIAGE_COUNTED_STATUSES].sort()).toEqual(
      ["guided", "in_progress", "open", "reopened"],
    );
  });

  it("excludes escalated on purpose — it has its own badge", () => {
    expect(TRIAGE_COUNTED_STATUSES).not.toContain("escalated");
  });

  it("excludes awaiting and final statuses", () => {
    for (const status of ["awaiting_customer", "resolved", "auto_resolved"]) {
      expect(TRIAGE_COUNTED_STATUSES).not.toContain(status);
    }
  });
});

// The bug in one assertion: with 7 open + 1 in_progress + 4 resolved, the list
// and the badge must now agree on 8.
describe("list and badge agree (the 8 vs 7 regression)", () => {
  const tickets = [
    ...Array.from({ length: 7 }, () => ({ status: "open" })),
    { status: "in_progress" },
    ...Array.from({ length: 4 }, () => ({ status: "resolved" })),
  ];

  it("list count and badge count are the same number", () => {
    const listCount = tickets.filter((t) => isTriageActive(t.status)).length;

    const countsByStatus: Record<string, number> = {};
    for (const t of tickets) countsByStatus[t.status] = (countsByStatus[t.status] ?? 0) + 1;
    const badgeCount = TRIAGE_COUNTED_STATUSES.reduce(
      (sum, status) => sum + (countsByStatus[status] ?? 0),
      0,
    );

    expect(listCount).toBe(8);
    expect(badgeCount).toBe(8);
  });
});
