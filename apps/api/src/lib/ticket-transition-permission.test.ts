import { describe, it, expect } from "bun:test";
import { checkTransitionPermission } from "./ticket-transition-permission.js";
import {
  ALLOWED_TRANSITIONS,
  isValidTransition,
  type TicketStatus,
  type DashboardRole,
} from "./ticket-status-machine.js";
import { TICKET_STATUSES } from "@kairo/types";

// ---------------------------------------------------------------------------
// KAI-191 — checkTransitionPermission() is the single gate every ticket
// route (PATCH /:id/status, POST /:id/escalate, the transitions inside
// POST /:id/reply) calls before writing tickets.status. These tests drive
// the coverage straight off ALLOWED_TRANSITIONS so a future edge is
// automatically exercised for every role, rather than a hand-picked sample.
// ---------------------------------------------------------------------------

const ALL_ROLES: DashboardRole[] = ["owner", "admin", "supervisor", "agent"];

describe("checkTransitionPermission — every edge x every role, derived from the matrix", () => {
  for (const [from, edges] of Object.entries(ALLOWED_TRANSITIONS) as [TicketStatus, typeof ALLOWED_TRANSITIONS[TicketStatus]][]) {
    for (const edge of edges) {
      for (const role of ALL_ROLES) {
        const allowed = edge.roles.includes(role);

        it(`${from} -> ${edge.to} for role '${role}' is ${allowed ? "allowed (ok:true)" : "denied (403)"}`, () => {
          const result = checkTransitionPermission(from, edge.to, role);
          if (allowed) {
            expect(result).toEqual({ ok: true });
          } else {
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.httpStatus).toBe(403);
              expect(result.body.code).toBe("TRANSITION_NOT_ALLOWED_FOR_ROLE");
            }
          }
        });
      }
    }
  }
});

describe("checkTransitionPermission — illegal transitions are always 422, regardless of role", () => {
  for (const from of TICKET_STATUSES) {
    for (const to of TICKET_STATUSES) {
      if (isValidTransition(from, to)) continue;

      for (const role of [...ALL_ROLES, null] as (DashboardRole | null)[]) {
        it(`${from} -> ${to} (illegal) for role '${role ?? "none"}' is 422 INVALID_TRANSITION`, () => {
          const result = checkTransitionPermission(from, to, role);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.httpStatus).toBe(422);
            expect(result.body.code).toBe("INVALID_TRANSITION");
          }
        });
      }
    }
  }
});

describe("checkTransitionPermission — 403 and 422 are distinguishable outcomes", () => {
  it("an illegal transition (closed -> open) is 422, never 403, no matter the role", () => {
    for (const role of ALL_ROLES) {
      const result = checkTransitionPermission("closed", "open", role);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.httpStatus).toBe(422);
        expect(result.body.code).toBe("INVALID_TRANSITION");
        expect(result.body.code).not.toBe("TRANSITION_NOT_ALLOWED_FOR_ROLE");
      }
    }
  });

  it("a legal transition no role reaches (resolved -> closed) is 403, never 422", () => {
    for (const role of ALL_ROLES) {
      const result = checkTransitionPermission("resolved", "closed", role);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.httpStatus).toBe(403);
        expect(result.body.code).toBe("TRANSITION_NOT_ALLOWED_FOR_ROLE");
        expect(result.body.code).not.toBe("INVALID_TRANSITION");
      }
    }
  });

  it("the two failure codes never overlap across the whole matrix", () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        for (const role of ALL_ROLES) {
          const result = checkTransitionPermission(from, to, role);
          if (result.ok) continue;
          // A result is exactly one of the two — the discriminated union
          // guarantees this at the type level; assert it holds at runtime too.
          expect([422, 403]).toContain(result.httpStatus);
          expect(["INVALID_TRANSITION", "TRANSITION_NOT_ALLOWED_FOR_ROLE"]).toContain(result.body.code);
        }
      }
    }
  });
});

describe("checkTransitionPermission — no role reaches 'closed' through this gate (KAI-191)", () => {
  const closedEdges: [TicketStatus, TicketStatus][] = [
    ["resolved", "closed"],
    ["ai_resolved", "closed"],
  ];

  for (const [from, to] of closedEdges) {
    it(`${from} -> closed stays legal in the machine (isValidTransition)`, () => {
      expect(isValidTransition(from, to)).toBe(true);
    });

    for (const role of ALL_ROLES) {
      it(`${from} -> closed is 403 for role '${role}'`, () => {
        const result = checkTransitionPermission(from, to, role);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.httpStatus).toBe(403);
          expect(result.body.code).toBe("TRANSITION_NOT_ALLOWED_FOR_ROLE");
        }
      });
    }

    it(`${from} -> closed is 403 (not 401/500) when role is null (no active membership)`, () => {
      const result = checkTransitionPermission(from, to, null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.httpStatus).toBe(403);
      }
    });
  }
});

describe("checkTransitionPermission — null role", () => {
  it("denies an otherwise-legal, otherwise-all-roles-allowed transition when role is null", () => {
    const result = checkTransitionPermission("open", "in_progress", null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(403);
      expect(result.body.code).toBe("TRANSITION_NOT_ALLOWED_FOR_ROLE");
    }
  });
});
