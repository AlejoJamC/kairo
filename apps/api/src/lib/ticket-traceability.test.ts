/**
 * KAI-115 — Ticket traceability: [KAIRO-<shortid>] token helpers
 */
import { describe, it, expect } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ticketShortId,
  buildKairoToken,
  appendKairoToken,
  extractKairoToken,
  findTicketByKairoToken,
} from "./ticket-traceability.js";

// ---------------------------------------------------------------------------
// Pure-logic tests
// ---------------------------------------------------------------------------

describe("ticketShortId", () => {
  it("takes the first 8 chars of a UUID", () => {
    expect(ticketShortId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400");
  });
});

describe("buildKairoToken", () => {
  it("wraps the short_id in brackets", () => {
    expect(buildKairoToken("abc12345")).toBe("[KAIRO-abc12345]");
  });
});

describe("appendKairoToken", () => {
  it("appends the token to a plain subject", () => {
    expect(appendKairoToken("Re: Order issue", "abc12345")).toBe("Re: Order issue [KAIRO-abc12345]");
  });

  it("does not double-append if token already present", () => {
    const subject = "Re: Order issue [KAIRO-abc12345]";
    expect(appendKairoToken(subject, "abc12345")).toBe(subject);
  });
});

describe("extractKairoToken", () => {
  it("extracts the short_id from a tagged subject", () => {
    expect(extractKairoToken("Re: Order issue [KAIRO-abc12345]")).toBe("abc12345");
  });

  it("is case-insensitive for KAIRO prefix", () => {
    expect(extractKairoToken("Re: Subject [kairo-abc12345]")).toBe("abc12345");
  });

  it("returns null when no token present", () => {
    expect(extractKairoToken("Regular subject line")).toBeNull();
  });

  it("returns null for malformed tokens (wrong length)", () => {
    expect(extractKairoToken("[KAIRO-abc]")).toBeNull(); // only 3 hex chars, not 8
  });

  it("returns null for non-hex short_id", () => {
    expect(extractKairoToken("[KAIRO-zzzzzzzz]")).toBeNull();
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
            eq(_col: string, _val: string) {
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
    const result = await findTicketByKairoToken(client, "account-1", "abc12345");
    expect(result).toEqual({ ticketId: "ticket-1", conversationId: "conv-1" });
  });

  it("returns conversationId null when ticket has no conversation yet", async () => {
    const client = makeMockClient({ id: "ticket-1", conversation_id: null });
    const result = await findTicketByKairoToken(client, "account-1", "abc12345");
    expect(result).toEqual({ ticketId: "ticket-1", conversationId: null });
  });

  it("returns null when no matching ticket", async () => {
    const client = makeMockClient(null);
    const result = await findTicketByKairoToken(client, "account-1", "notfound");
    expect(result).toBeNull();
  });
});
