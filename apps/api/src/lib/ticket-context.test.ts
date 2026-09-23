import { describe, it, expect } from "bun:test";
import { RESOLVED_STATUSES } from "@kairo/types";

import {
  RELATED_CONTEXT_THRESHOLD,
  RESOLVED_STATUS_FILTER,
  findResolvedCases,
  retrieveTicketContext,
  ticketQueryText,
  type ContextDeps,
} from "./ticket-context.js";

type RpcCall = { fn: string; args: Record<string, unknown> };

function fakeSupabase(opts: {
  similar?: { data: unknown; error: { message: string } | null };
  kb?: { data: unknown; error: { message: string } | null };
  articles?: unknown[];
}) {
  const rpcCalls: RpcCall[] = [];
  const articleFilters: Array<[string, unknown]> = [];
  const db = {
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === "find_similar_tickets") return opts.similar ?? { data: [], error: null };
      if (fn === "find_relevant_kb") return opts.kb ?? { data: [], error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
    from(_table: string) {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (col: string, v: unknown) => {
        articleFilters.push([col, v]);
        return q;
      };
      q.in = async () => ({ data: opts.articles ?? [], error: null });
      return q;
    },
  };
  return { db: db as unknown as NonNullable<ContextDeps["supabase"]>, rpcCalls, articleFilters };
}

describe("findResolvedCases", () => {
  it("counts both final states as resolved and uses the shared threshold", async () => {
    const { db, rpcCalls } = fakeSupabase({});
    await findResolvedCases({ ticketId: "t", accountId: "a" }, { supabase: db });

    expect(rpcCalls[0]!.args.p_status_filter).toBe(RESOLVED_STATUS_FILTER);
    expect(RESOLVED_STATUS_FILTER.split(",").sort()).toEqual([...RESOLVED_STATUSES].sort());
    expect(RESOLVED_STATUS_FILTER.split(",")).toContain("ai_resolved");
    expect(rpcCalls[0]!.args.p_threshold).toBe(RELATED_CONTEXT_THRESHOLD);
    expect(rpcCalls[0]!.args.p_account_id).toBe("a");
  });

  it("returns null on an RPC error, so a caller can tell failure from no match", async () => {
    const { db } = fakeSupabase({ similar: { data: null, error: { message: "function does not exist" } } });
    expect(await findResolvedCases({ ticketId: "t", accountId: "a" }, { supabase: db })).toBeNull();
  });
});

describe("retrieveTicketContext", () => {
  it("returns ranked KB articles with content, most similar first, scoped to the account", async () => {
    const { db, articleFilters } = fakeSupabase({
      kb: {
        data: [
          { article_id: "kb-2", title: "B", similarity: 0.9 },
          { article_id: "kb-1", title: "A", similarity: 0.8 },
          { article_id: "kb-3", title: "C", similarity: 0.5 },
        ],
        error: null,
      },
      articles: [
        { id: "kb-1", title: "A", content: "a", tags: null },
        { id: "kb-2", title: "B", content: "b", tags: ["x"] },
      ],
    });

    const ctx = await retrieveTicketContext(
      { ticketId: "t", accountId: "a", queryText: "Cannot log in" },
      { supabase: db, embed: async () => [0.1] },
    );

    expect(ctx.kbArticles.map((a) => a.id)).toEqual(["kb-2", "kb-1"]);
    expect(ctx.kbArticles[1]!.tags).toEqual([]);
    expect(articleFilters).toContainEqual(["account_id", "a"]);
    expect(articleFilters).toContainEqual(["is_published", true]);
    expect(ctx.degraded).toEqual([]);
  });

  it("still returns resolved cases when the embedding service is down", async () => {
    const { db } = fakeSupabase({
      similar: {
        data: [{ ticket_id: "t-9", ticket_number: 9, subject: "Login loop", resolved_at: null, resolution_summary: "Fixed", similarity: 0.88 }],
        error: null,
      },
    });

    const ctx = await retrieveTicketContext(
      { ticketId: "t", accountId: "a", queryText: "Cannot log in" },
      {
        supabase: db,
        embed: async () => {
          throw new Error("embedding 500");
        },
      },
    );

    expect(ctx.kbArticles).toEqual([]);
    expect(ctx.resolvedCases.map((c) => c.id)).toEqual(["t-9"]);
    expect(ctx.degraded).toEqual(["embedding_unavailable"]);
  });

  it("reports each failed source instead of throwing", async () => {
    const { db } = fakeSupabase({
      similar: { data: null, error: { message: "down" } },
      kb: { data: null, error: { message: "down" } },
    });
    const ctx = await retrieveTicketContext(
      { ticketId: "t", accountId: "a", queryText: "q" },
      { supabase: db, embed: async () => [0.1] },
    );
    expect(ctx.degraded.sort()).toEqual(["cases_rpc_failed", "kb_rpc_failed"]);
  });

  it("does not embed when there is no text to search with", async () => {
    const { db } = fakeSupabase({});
    let embedded = false;
    const ctx = await retrieveTicketContext(
      { ticketId: "t", accountId: "a", queryText: "" },
      {
        supabase: db,
        embed: async () => {
          embedded = true;
          return [0.1];
        },
      },
    );
    expect(embedded).toBe(false);
    expect(ctx.degraded).toEqual([]);
  });
});

describe("ticketQueryText", () => {
  it("joins subject and the start of the body, skipping empties", () => {
    expect(ticketQueryText("Subject", null)).toBe("Subject");
    expect(ticketQueryText(null, "  body  ")).toBe("body");
    expect(ticketQueryText("S", "x".repeat(500)).length).toBe(1 + 2 + 200);
  });
});
