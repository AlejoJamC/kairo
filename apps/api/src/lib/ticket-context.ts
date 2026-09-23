// ---------------------------------------------------------------------------
// The single source of similar resolved tickets and relevant KB articles, for
// LLM prompts and for the agent's panel.
//
// Every consumer asks the same question with the same parameters: a ticket is
// resolved when its status is any final state in RESOLVED_STATUSES
// (`ai_resolved` included), and a match counts from
// RELATED_CONTEXT_THRESHOLD up. `/similar` (grouping) and the escalation
// past-L2 check ask different questions and keep their own calls.
//
// Never throws: each source that fails is reported in `degraded`, and the
// caller decides what a missing source means for it.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding } from "@kairo/intelligence";
import { RESOLVED_STATUSES } from "@kairo/types";

import { supabase as defaultSupabase } from "./supabase.js";

/** Cosine similarity from which a ticket or article is related context — the RPCs' own default. */
export const RELATED_CONTEXT_THRESHOLD = 0.75;

/** The status filter `find_similar_tickets` takes: a comma-separated list. */
export const RESOLVED_STATUS_FILTER = RESOLVED_STATUSES.join(",");

// A support prompt carries a handful of references; more dilutes the context
// the model is asked to ground its answer on.
const DEFAULT_KB_LIMIT = 3;
const DEFAULT_CASES_LIMIT = 2;

// What the KB query embeds when the caller gives no text: the subject and the
// start of the body, the same text the ticket's own embedding is built from.
const QUERY_BODY_PREVIEW_CHARS = 200;

export interface ResolvedCase {
  id: string;
  ticketNumber: number;
  subject: string | null;
  resolvedAt: string | null;
  resolutionSummary: string | null;
  similarity: number | null;
}

export interface KbArticle {
  id: string;
  title: string;
  content: string;
  tags: string[];
  similarity: number | null;
}

export type ContextDegradation = "embedding_unavailable" | "kb_rpc_failed" | "cases_rpc_failed";

export interface TicketContext {
  kbArticles: KbArticle[];
  resolvedCases: ResolvedCase[];
  degraded: ContextDegradation[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export interface ContextDeps {
  supabase?: Db;
  embed?: (text: string, context?: { ticketId?: string; accountId?: string }) => Promise<number[]>;
}

/**
 * Resolved tickets similar to this one, most similar first. Uses the ticket's
 * stored embedding, so it needs no embedding call of its own.
 *
 * `null` when the RPC failed (distinct from "no match"), so a caller with a
 * fallback of its own can tell the two apart.
 */
export async function findResolvedCases(
  input: { ticketId: string; accountId: string; limit?: number },
  deps: ContextDeps = {}
): Promise<ResolvedCase[] | null> {
  const db = deps.supabase ?? defaultSupabase;
  try {
    const { data, error } = await db.rpc("find_similar_tickets", {
      p_ticket_id: input.ticketId,
      p_account_id: input.accountId,
      p_limit: input.limit ?? DEFAULT_CASES_LIMIT,
      p_threshold: RELATED_CONTEXT_THRESHOLD,
      p_status_filter: RESOLVED_STATUS_FILTER,
    });
    if (error) {
      console.warn(`[ticket-context] find_similar_tickets failed for ticket ${input.ticketId}: ${error.message}`);
      return null;
    }
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r["ticket_id"] as string,
      ticketNumber: r["ticket_number"] as number,
      subject: (r["subject"] as string | null) ?? null,
      resolvedAt: (r["resolved_at"] as string | null) ?? null,
      resolutionSummary: (r["resolution_summary"] as string | null) ?? null,
      similarity: (r["similarity"] as number | null) ?? null,
    }));
  } catch (err) {
    console.warn(`[ticket-context] find_similar_tickets threw for ticket ${input.ticketId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Published KB articles relevant to `queryText`, most similar first, with
 * their content. Ranked matches only: an unranked "latest articles" list is a
 * panel fallback, not context for a model.
 */
export async function findRelevantKb(
  input: { queryText: string; accountId: string; ticketId?: string; limit?: number },
  deps: ContextDeps = {}
): Promise<{ articles: KbArticle[]; degraded: ContextDegradation[] }> {
  const db = deps.supabase ?? defaultSupabase;
  const embed = deps.embed ?? generateEmbedding;

  let vector: number[];
  try {
    vector = await embed(input.queryText, {
      ...(input.ticketId ? { ticketId: input.ticketId } : {}),
      accountId: input.accountId,
    });
  } catch (err) {
    console.warn(`[ticket-context] embedding unavailable for account ${input.accountId}: ${err instanceof Error ? err.message : String(err)}`);
    return { articles: [], degraded: ["embedding_unavailable"] };
  }

  try {
    const { data, error } = await db.rpc("find_relevant_kb", {
      p_query_embedding: vector,
      p_account_id: input.accountId,
      p_limit: input.limit ?? DEFAULT_KB_LIMIT,
    });
    if (error) {
      console.warn(`[ticket-context] find_relevant_kb failed for account ${input.accountId}: ${error.message}`);
      return { articles: [], degraded: ["kb_rpc_failed"] };
    }

    const ranked = ((data ?? []) as Array<{ article_id: string; similarity: number }>).filter(
      (r) => r.similarity >= RELATED_CONTEXT_THRESHOLD
    );
    if (ranked.length === 0) return { articles: [], degraded: [] };

    const { data: rows, error: rowsError } = await db
      .from("kb_articles")
      .select("id, title, content, tags")
      .eq("account_id", input.accountId)
      .eq("is_published", true)
      .in("id", ranked.map((r) => r.article_id));
    if (rowsError) {
      console.warn(`[ticket-context] kb_articles unreadable for account ${input.accountId}: ${rowsError.message}`);
      return { articles: [], degraded: ["kb_rpc_failed"] };
    }

    const byId = new Map(((rows ?? []) as Array<{ id: string; title: string; content: string; tags: string[] | null }>).map((a) => [a.id, a]));
    const articles = ranked.flatMap((r) => {
      const a = byId.get(r.article_id);
      return a ? [{ id: a.id, title: a.title, content: a.content, tags: a.tags ?? [], similarity: r.similarity }] : [];
    });
    return { articles, degraded: [] };
  } catch (err) {
    console.warn(`[ticket-context] find_relevant_kb threw for account ${input.accountId}: ${err instanceof Error ? err.message : String(err)}`);
    return { articles: [], degraded: ["kb_rpc_failed"] };
  }
}

/** The text a ticket's KB query embeds: subject, then the start of the body. */
export function ticketQueryText(subject: string | null | undefined, bodyPlain: string | null | undefined): string {
  const s = (subject ?? "").trim();
  const b = (bodyPlain ?? "").trim().slice(0, QUERY_BODY_PREVIEW_CHARS);
  return [s, b].filter(Boolean).join("\n\n");
}

/** Similar resolved tickets and relevant KB articles for one ticket. */
export async function retrieveTicketContext(
  input: { ticketId: string; accountId: string; queryText: string; kbLimit?: number; casesLimit?: number },
  deps: ContextDeps = {}
): Promise<TicketContext> {
  const [kb, cases] = await Promise.all([
    input.queryText.length > 0
      ? findRelevantKb(
          {
            queryText: input.queryText,
            accountId: input.accountId,
            ticketId: input.ticketId,
            ...(input.kbLimit !== undefined ? { limit: input.kbLimit } : {}),
          },
          deps
        )
      : Promise.resolve({ articles: [] as KbArticle[], degraded: [] as ContextDegradation[] }),
    findResolvedCases(
      {
        ticketId: input.ticketId,
        accountId: input.accountId,
        ...(input.casesLimit !== undefined ? { limit: input.casesLimit } : {}),
      },
      deps
    ),
  ]);

  return {
    kbArticles: kb.articles,
    resolvedCases: cases ?? [],
    degraded: [...kb.degraded, ...(cases === null ? (["cases_rpc_failed"] as const) : [])],
  };
}
