// KAI-42: ticket embedding generation.
//
// Called fire-and-forget from the Gmail sync pipeline (tier1-fast-path +
// incremental-sync) AFTER classification persists a new ticket. Generates a
// pgvector(512) embedding via @kairo/intelligence (voyage-3-lite) and writes
// it to tickets.embedding so downstream similarity search (KAI-42's
// /knowledge-context, related-history, suggest-reply) can rank past cases.
//
// Per ADR-012 + KAI-42 spec: this MUST NOT block ticket classification — any
// failure is logged and swallowed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding } from "@kairo/intelligence";

export interface MaybeGenerateTicketEmbeddingArgs {
  supabase: SupabaseClient;
  ticketId: string;
  subject: string;
  bodyPreview: string; // first ~200 chars of body OR Gmail snippet
  embedFn?: (text: string) => Promise<number[]>; // override for tests
}

export type TicketEmbeddingOutcome =
  | { status: "ok" }
  | { status: "skipped"; reason: "empty_text" }
  | { status: "failed"; reason: "embed_error" | "persist_error" };

// Upper bound on chars sent to the embedding provider. nomic-embed-text-v2-moe
// caps at 512 tokens; worst-case ratio (URLs, code, unicode) can hit ~3.5
// chars/token, so 1000 chars stays well under in all realistic content.
const EMBEDDING_TEXT_MAX_CHARS = 1000;

/**
 * Build the canonical embedding text for a ticket: subject + body preview.
 * Returns null when both inputs collapse to empty whitespace.
 */
export function buildEmbeddingText(subject: string, bodyPreview: string): string | null {
  const subj = (subject ?? "").trim();
  const body = (bodyPreview ?? "").trim();
  const combined = [subj, body].filter(Boolean).join("\n\n");
  if (combined.length === 0) return null;
  return combined.length > EMBEDDING_TEXT_MAX_CHARS
    ? combined.slice(0, EMBEDDING_TEXT_MAX_CHARS)
    : combined;
}

export async function maybeGenerateTicketEmbedding(
  args: MaybeGenerateTicketEmbeddingArgs
): Promise<TicketEmbeddingOutcome> {
  const text = buildEmbeddingText(args.subject, args.bodyPreview);
  if (!text) return { status: "skipped", reason: "empty_text" };

  const embed = args.embedFn ?? generateEmbedding;
  let vector: number[];
  try {
    vector = await embed(text);
  } catch (err) {
    console.error(
      `[ticket-embedding] generateEmbedding failed for ticket ${args.ticketId}:`,
      err instanceof Error ? err.message : err
    );
    return { status: "failed", reason: "embed_error" };
  }

  const { error } = await args.supabase
    .from("tickets")
    .update({
      embedding: vector,
      embedding_updated_at: new Date().toISOString(),
    })
    .eq("id", args.ticketId);

  if (error) {
    console.error(
      `[ticket-embedding] persist failed for ticket ${args.ticketId}: ${error.message}`
    );
    return { status: "failed", reason: "persist_error" };
  }

  return { status: "ok" };
}
