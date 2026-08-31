import { describe, it, expect } from "bun:test";
import {
  isValidTransition,
  getTransitionError,
  isTransitionAllowedForRole,
  getAllowedTransitionsForRole,
  isTicketStatus,
  ALLOWED_TRANSITIONS,
  type TicketStatus,
  type DashboardRole,
} from "./ticket-status-machine.js";
import { TICKET_STATUSES } from "@kairo/types";

const ALL_ROLES: DashboardRole[] = ["owner", "admin", "supervisor", "agent"];

describe("isTicketStatus", () => {
  it("accepts all valid statuses", () => {
    for (const s of TICKET_STATUSES) {
      expect(isTicketStatus(s)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isTicketStatus("waiting")).toBe(false);
    expect(isTicketStatus("archived")).toBe(false);
    expect(isTicketStatus("")).toBe(false);
  });
});

describe("isValidTransition — same-status is always invalid", () => {
  for (const s of TICKET_STATUSES) {
    it(`${s} → ${s} is invalid`, () => {
      expect(isValidTransition(s, s)).toBe(false);
    });
  }
});

describe("isValidTransition — allowed paths", () => {
  const valid: [TicketStatus, TicketStatus][] = [
    ["open",              "awaiting_customer"],
    ["open",              "in_progress"],
    ["open",              "resolved"],
    ["open",              "escalated"],
    ["open",              "ai_resolved"],
    ["awaiting_customer", "open"],
    ["awaiting_customer", "resolved"],
    ["awaiting_customer", "escalated"],
    ["in_progress",       "open"],
    ["in_progress",       "awaiting_customer"],
    ["in_progress",       "resolved"],
    ["in_progress",       "escalated"],
    ["resolved",          "open"],
    ["resolved",          "reopened"],       // KAI-221: customer re-opens resolved ticket
    ["resolved",          "closed"],         // KAI-191: resolved's assertion becoming firm
    ["escalated",         "resolved"],
    ["escalated",         "open"],
    ["escalated",         "reopened"],       // KAI-221
    ["ai_resolved",       "open"],
    ["ai_resolved",       "reopened"],       // KAI-221
    ["ai_resolved",       "closed"],         // KAI-191
    ["reopened",          "in_progress"],    // KAI-221: agent picks up reopened ticket
    ["reopened",          "resolved"],
    ["reopened",          "escalated"],
    ["reopened",          "awaiting_customer"],
  ];

  for (const [from, to] of valid) {
    it(`${from} → ${to} is valid`, () => {
      expect(isValidTransition(from, to)).toBe(true);
    });
  }
});

describe("isValidTransition — blocked paths", () => {
  const blocked: [TicketStatus, TicketStatus][] = [
    ["resolved",      "awaiting_customer"],
    ["resolved",      "escalated"],
    ["resolved",      "ai_resolved"],
    ["resolved",      "in_progress"],
    ["escalated",     "awaiting_customer"],
    ["escalated",     "ai_resolved"],
    ["escalated",     "in_progress"],
    ["ai_resolved",   "resolved"],
    ["ai_resolved",   "escalated"],
    ["reopened",      "open"],              // KAI-221: direct → open not allowed from reopened
    ["reopened",      "ai_resolved"],
  ];

  for (const [from, to] of blocked) {
    it(`${from} → ${to} is blocked`, () => {
      expect(isValidTransition(from, to)).toBe(false);
    });
  }
});

describe("ALLOWED_TRANSITIONS coverage", () => {
  it("every status has an entry in ALLOWED_TRANSITIONS", () => {
    for (const s of TICKET_STATUSES) {
      expect(ALLOWED_TRANSITIONS[s]).toBeDefined();
      expect(Array.isArray(ALLOWED_TRANSITIONS[s])).toBe(true);
    }
  });

  it("all transition targets are valid statuses", () => {
    for (const [, edges] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const edge of edges) {
        expect(isTicketStatus(edge.to)).toBe(true);
      }
    }
  });
});

describe("closed — reachable only from the resolved family (KAI-191)", () => {
  const legalPredecessors: TicketStatus[] = ["resolved", "ai_resolved"];

  it("resolved → closed is valid", () => {
    expect(isValidTransition("resolved", "closed")).toBe(true);
  });

  it("ai_resolved → closed is valid", () => {
    expect(isValidTransition("ai_resolved", "closed")).toBe(true);
  });

  for (const s of TICKET_STATUSES) {
    if (legalPredecessors.includes(s)) continue;
    it(`${s} → closed is rejected`, () => {
      expect(isValidTransition(s, "closed")).toBe(false);
    });
  }
});

describe("closed — terminal, no way back (KAI-191)", () => {
  for (const s of TICKET_STATUSES) {
    it(`closed → ${s} is rejected`, () => {
      expect(isValidTransition("closed", s)).toBe(false);
    });
  }

  it("ALLOWED_TRANSITIONS.closed has zero outgoing transitions", () => {
    expect(ALLOWED_TRANSITIONS.closed).toEqual([]);
  });
});

describe("getTransitionError", () => {
  it("returns message with from, to, and allowed list", () => {
    const msg = getTransitionError("resolved", "escalated");
    expect(msg).toContain("resolved");
    expect(msg).toContain("escalated");
    expect(msg).toContain("open");
  });
});

// ---------------------------------------------------------------------------
// KAI-191 — role-per-edge permission matrix. Every edge in
// ALLOWED_TRANSITIONS is exercised against every DashboardRole here, driven
// straight off the matrix itself, so a future edge is automatically covered
// instead of relying on a hand-picked sample.
// ---------------------------------------------------------------------------

describe("isTransitionAllowedForRole — every edge x every role, derived from the matrix", () => {
  for (const [from, edges] of Object.entries(ALLOWED_TRANSITIONS) as [TicketStatus, typeof ALLOWED_TRANSITIONS[TicketStatus]][]) {
    for (const edge of edges) {
      for (const role of ALL_ROLES) {
        const expected = edge.roles.includes(role);
        it(`${from} -> ${edge.to} for role '${role}' is ${expected ? "allowed" : "denied"}`, () => {
          expect(isTransitionAllowedForRole(from, edge.to, role)).toBe(expected);
        });
      }
    }
  }
});

describe("isTransitionAllowedForRole — illegal transitions are denied regardless of role", () => {
  for (const from of TICKET_STATUSES) {
    for (const to of TICKET_STATUSES) {
      if (isValidTransition(from, to)) continue;
      for (const role of ALL_ROLES) {
        it(`${from} -> ${to} (illegal) denies role '${role}'`, () => {
          expect(isTransitionAllowedForRole(from, to, role)).toBe(false);
        });
      }
    }
  }
});

describe("closed — no role reaches it through the API, but the edge stays legal (KAI-191)", () => {
  const closedEdges: [TicketStatus, TicketStatus][] = [
    ["resolved", "closed"],
    ["ai_resolved", "closed"],
  ];

  for (const [from, to] of closedEdges) {
    it(`${from} -> closed is legal in the machine`, () => {
      expect(isValidTransition(from, to)).toBe(true);
    });

    for (const role of ALL_ROLES) {
      it(`${from} -> closed denies role '${role}'`, () => {
        expect(isTransitionAllowedForRole(from, to, role)).toBe(false);
      });
    }
  }
});

describe("getAllowedTransitionsForRole", () => {
  it("returns exactly the .to values of edges whose roles include the given role, per from-state", () => {
    for (const [from, edges] of Object.entries(ALLOWED_TRANSITIONS) as [TicketStatus, typeof ALLOWED_TRANSITIONS[TicketStatus]][]) {
      for (const role of ALL_ROLES) {
        const expected = edges.filter((e) => e.roles.includes(role)).map((e) => e.to);
        expect(getAllowedTransitionsForRole(from, role)).toEqual(expected);
      }
    }
  });

  it("excludes 'closed' from every role's allowed set out of resolved/ai_resolved", () => {
    for (const role of ALL_ROLES) {
      expect(getAllowedTransitionsForRole("resolved", role)).not.toContain("closed");
      expect(getAllowedTransitionsForRole("ai_resolved", role)).not.toContain("closed");
    }
  });

  it("returns an empty list from 'closed' for every role (terminal state)", () => {
    for (const role of ALL_ROLES) {
      expect(getAllowedTransitionsForRole("closed", role)).toEqual([]);
    }
  });
});
