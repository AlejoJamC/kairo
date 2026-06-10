/**
 * KAI-115 — Ticket traceability: [KAIRO-<shortid>] token helpers
 */
import { describe, it, expect } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildKairoToken,
  appendKairoToken,
  extractKairoToken,
  findTicketByKairoToken,
} from "./ticket-traceability.js";

// ---------------------------------------------------------------------------
// Pure-logic tests
// ---------------------------------------------------------------------------

describe("buildKairoToken", () => {
  it("wraps the ticket_number in brackets", () => {
    expect(buildKairoToken(453)).toBe("[KAIRO-453]");
  });
});

describe("appendKairoToken", () => {
  it("appends the token to a plain subject", () => {
    expect(appendKairoToken("Re: Order issue", 453)).toBe("Re: Order issue [KAIRO-453]");
  });

  it("does not double-append if token already present", () => {
    const subject = "Re: Order issue [KAIRO-453]";
    expect(appendKairoToken(subject, 453)).toBe(subject);
  });
});

describe("extractKairoToken", () => {
  it("extracts the ticket_number from a tagged subject", () => {
    expect(extractKairoToken("Re: Order issue [KAIRO-453]")).toBe(453);
  });

  it("is case-insensitive for KAIRO prefix", () => {
    expect(extractKairoToken("Re: Subject [kairo-453]")).toBe(453);
  });

  it("returns null when no token present", () => {
    expect(extractKairoToken("Regular subject line")).toBeNull();
  });

  it("returns null for non-numeric tokens (old UUID-fragment format)", () => {
    expect(extractKairoToken("[KAIRO-abc12345]")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findTicketByKairoToken — mock Supabase client
// ---------------------------------------------------------------------------

function makeMockClient(row: Record<string, unknown> | null) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return this;
            },
            is(_col: string, _val: unknown) {
              return this;
            },
            limit(_n: number) {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: row, error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("findTicketByKairoToken", () => {
  it("returns ticketId + conversationId when ticket found", async () => {
    const client = makeMockClient({ id: "ticket-1", conversation_id: "conv-1" });
    const result = await findTicketByKairoToken(client, "account-1", 453);
    expect(result).toEqual({ ticketId: "ticket-1", conversationId: "conv-1" });
  });

  it("returns conversationId null when ticket has no conversation yet", async () => {
    const client = makeMockClient({ id: "ticket-1", conversation_id: null });
    const result = await findTicketByKairoToken(client, "account-1", 453);
    expect(result).toEqual({ ticketId: "ticket-1", conversationId: null });
  });

  it("returns null when no matching ticket", async () => {
    const client = makeMockClient(null);
    const result = await findTicketByKairoToken(client, "account-1", 999);
    expect(result).toBeNull();
  });
});
