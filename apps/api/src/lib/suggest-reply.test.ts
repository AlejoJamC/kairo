import { describe, it, expect, mock } from "bun:test";
import { ProviderError, type LlmFeatureJsonRequest } from "@kairo/intelligence";

import {
  ReplySuggestionSchema,
  buildReplySuggestionVars,
  formatClientProfile,
  formatKbArticles,
  formatMessageHistory,
  formatResolvedCases,
  suggestReply,
  type ReplySuggestion,
  type SuggestReplyDeps,
} from "./reply-suggestion.js";
import type { TicketContext } from "./ticket-context.js";

// ---------------------------------------------------------------------------
// Reply suggestion — tests against the real module, not copies of it.
// ---------------------------------------------------------------------------

const TICKET = {
  id: "11111111-1111-1111-1111-111111111111",
  subject: "Cannot log in",
  body_plain: "I cannot log in since this morning.",
  ticket_type: "support",
  priority: "P2",
  category: "account",
  emotion: null,
  conversation_id: "conv-1",
  client_id: "client-1",
};

const EMPTY_CONTEXT: TicketContext = { kbArticles: [], resolvedCases: [], degraded: [] };

describe("ReplySuggestionSchema", () => {
  it("accepts the answer the prompt asks for", () => {
    expect(ReplySuggestionSchema.safeParse({ suggestion: "Hi", confidence: 0.8, detected_language: "en" }).success).toBe(true);
  });

  it("rejects out-of-range confidence and unknown languages", () => {
    expect(ReplySuggestionSchema.safeParse({ suggestion: "s", confidence: 1.5, detected_language: "es" }).success).toBe(false);
    expect(ReplySuggestionSchema.safeParse({ suggestion: "s", confidence: 0.5, detected_language: "fr" }).success).toBe(false);
  });
});

describe("prompt inputs", () => {
  it("renders unknowns as unavailable in the tenant's language, never as an invented value", () => {
    const es = buildReplySuggestionVars({ ticket: TICKET, messages: [], client: null, context: EMPTY_CONTEXT, lang: "es" });
    expect(es.emotion).toBe("(no disponible)");
    expect(es.client_profile).toBe("(no disponible)");
    expect(es.kb_articles).toBe("(no disponible)");

    const en = buildReplySuggestionVars({ ticket: TICKET, messages: [], client: null, context: EMPTY_CONTEXT, lang: "en" });
    expect(en.similar_case).toBe("(not available)");
  });

  it("fills every placeholder the prompt declares", () => {
    const vars = buildReplySuggestionVars({ ticket: TICKET, messages: [], client: null, context: EMPTY_CONTEXT, lang: "en" });
    expect(Object.keys(vars).sort()).toEqual(
      ["category", "client_profile", "emotion", "kb_articles", "message_history", "priority", "similar_case", "subject", "ticket_type"],
    );
  });

  it("keeps only each message's new text, labelled by side, in the tenant's language", () => {
    const history = formatMessageHistory(
      [
        { direction: "inbound", body_plain: "Still broken.\n\nOn Mon, Acme Support <support@acme.com> wrote:\n> Try again", received_at: "2026-01-02" },
        { direction: "outbound", body_plain: "", received_at: "2026-01-03" },
      ],
      "en",
    );
    expect(history).toContain("[Client — 2026-01-02]");
    expect(history).toContain("Still broken.");
    expect(history).not.toContain("> Try again");
    expect(history).not.toContain("Agent");
  });

  it("lists only the client fields that are known", () => {
    expect(formatClientProfile({ name: "Acme", plan_type: null, sla_level: "gold" }, "en")).toBe("Name: Acme | SLA: gold");
  });

  it("renders resolved cases and KB articles as the model's references", () => {
    const cases = formatResolvedCases(
      [{ id: "t-9", ticketNumber: 9, subject: "Login loop", resolvedAt: null, resolutionSummary: "Cleared the session", similarity: 0.9 }],
      "en",
    );
    expect(cases).toBe("Subject: Login loop\nResolution: Cleared the session");

    const kb = formatKbArticles([{ id: "kb-1", title: "Reset access", content: "x".repeat(5000), tags: [], similarity: 0.8 }], "en");
    expect(kb.startsWith("### Reset access\n")).toBe(true);
    expect(kb.length).toBeLessThan(5000);
  });
});

// A chainable fake of the few Supabase query shapes suggestReply issues.
function fakeDb(opts: { ticket: typeof TICKET | null }) {
  const proposals: Record<string, unknown>[] = [];
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    c.single = async () => result;
    c.maybeSingle = async () => result;
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return c;
  };
  const db = {
    from(table: string) {
      if (table === "tickets") return chain({ data: opts.ticket, error: opts.ticket ? null : { message: "not found" } });
      if (table === "messages") return chain({ data: [{ direction: "inbound", body_plain: "Help please", received_at: "2026-01-01" }], error: null });
      if (table === "clients") return chain({ data: { name: "Acme", plan_type: "pro", sla_level: null }, error: null });
      if (table === "ticket_proposals") {
        return {
          insert(row: Record<string, unknown>) {
            proposals.push(row);
            return chain({ data: { id: "proposal-1" }, error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { db: db as unknown as NonNullable<SuggestReplyDeps["supabase"]>, proposals };
}

const CONTEXT_WITH_KB: TicketContext = {
  kbArticles: [{ id: "kb-1", title: "Reset access", content: "Steps", tags: [], similarity: 0.9 }],
  resolvedCases: [],
  degraded: [],
};

describe("suggestReply", () => {
  it("returns null for a ticket outside the account", async () => {
    const { db } = fakeDb({ ticket: null });
    const run = mock(async () => {
      throw new Error("must not be called");
    });
    const out = await suggestReply({ ticketId: TICKET.id, accountId: "acc", userId: "u" }, { supabase: db, run });
    expect(out).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("asks in the tenant's language, grounds on KB articles, and stores the model that answered", async () => {
    const { db, proposals } = fakeDb({ ticket: TICKET });
    let request: LlmFeatureJsonRequest<ReplySuggestion> | undefined;

    const out = await suggestReply(
      { ticketId: TICKET.id, accountId: "acc", userId: "u" },
      {
        supabase: db,
        resolveLanguage: async () => "en",
        retrieve: async () => CONTEXT_WITH_KB,
        run: async (r) => {
          request = r;
          return {
            data: { suggestion: "Hello from Acme", confidence: 0.7, detected_language: "en" },
            prompt: "p",
            promptVersion: "1.0.1",
            model: "reported-model",
            usage: { promptTokens: 1, completionTokens: 1 },
            latencyMs: 5,
            llmCallId: "call-1",
          };
        },
      },
    );

    expect(request?.lang).toBe("en");
    expect(request?.feature).toBe("reply_suggestion");
    expect(request?.vars.kb_articles).toContain("Reset access");
    expect(request?.vars.client_profile).toBe("Name: Acme | Plan: pro");
    expect(out).toMatchObject({ suggestion: "Hello from Acme", referencedKbArticles: ["kb-1"], llmCallId: "call-1", proposalId: "proposal-1" });
    expect(proposals[0]).toMatchObject({ model_version: "reported-model", referenced_kb_articles: ["kb-1"], status: "pending" });
  });

  it("lets a provider failure through unchanged so the route can tell retriable from permanent", async () => {
    const { db } = fakeDb({ ticket: TICKET });
    const failure = new ProviderError("overloaded", true);
    const err = await suggestReply(
      { ticketId: TICKET.id, accountId: "acc", userId: "u" },
      {
        supabase: db,
        resolveLanguage: async () => "es",
        retrieve: async () => EMPTY_CONTEXT,
        run: async () => {
          throw failure;
        },
      },
    ).catch((e: unknown) => e);
    expect(err).toBe(failure);
  });
});
