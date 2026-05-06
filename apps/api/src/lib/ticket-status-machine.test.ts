import { describe, it, expect } from "bun:test";
import {
  isValidTransition,
  getTransitionError,
  isTicketStatus,
  ALLOWED_TRANSITIONS,
  TICKET_STATUSES,
  type TicketStatus,
} from "./ticket-status-machine.js";

describe("isTicketStatus", () => {
  it("accepts all valid statuses", () => {
    for (const s of TICKET_STATUSES) {
      expect(isTicketStatus(s)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isTicketStatus("waiting")).toBe(false);
    expect(isTicketStatus("closed")).toBe(false);
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
    ["open",              "guided"],
    ["open",              "auto_resolved"],
    ["awaiting_customer", "open"],
    ["awaiting_customer", "resolved"],
    ["awaiting_customer", "escalated"],
    ["in_progress",       "open"],
    ["in_progress",       "awaiting_customer"],
    ["in_progress",       "resolved"],
    ["in_progress",       "escalated"],
    ["resolved",          "open"],
    ["escalated",         "resolved"],
    ["escalated",         "open"],
    ["guided",            "resolved"],
    ["auto_resolved",     "open"],
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
    ["resolved",      "guided"],
    ["resolved",      "auto_resolved"],
    ["resolved",      "in_progress"],
    ["escalated",     "awaiting_customer"],
    ["escalated",     "guided"],
    ["escalated",     "auto_resolved"],
    ["escalated",     "in_progress"],
    ["guided",        "open"],
    ["guided",        "escalated"],
    ["guided",        "awaiting_customer"],
    ["auto_resolved", "resolved"],
    ["auto_resolved", "escalated"],
    ["auto_resolved", "guided"],
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
    for (const [, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const t of targets) {
        expect(isTicketStatus(t)).toBe(true);
      }
    }
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
