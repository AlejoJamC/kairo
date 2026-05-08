// KAI-42: KB-article embedding generation.
//
// Used by /v1/kb-articles POST and PUT to keep kb_articles.embedding in sync
// with title + content. Embedding text mirrors the ticket pipeline format
// (title acts like subject; content is the body).

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding } from "@kairo/intelligence";

export function buildKbEmbeddingText(title: string, content: string): string | null {
  const t = (title ?? "").trim();
  const c = (content ?? "").trim();
  const combined = [t, c].filter(Boolean).join("\n\n");
  return combined.length === 0 ? null : combined;
}

export interface MaybeGenerateKbEmbeddingArgs {
  supabase: SupabaseClient;
  articleId: string;
  title: string;
  content: string;
  embedFn?: (text: string) => Promise<number[]>;
}

export type KbEmbeddingOutcome =
  | { status: "ok" }
  | { status: "skipped"; reason: "empty_text" }
  | { status: "failed"; reason: "embed_error" | "persist_error" };

export async function maybeGenerateKbEmbedding(
  args: MaybeGenerateKbEmbeddingArgs
): Promise<KbEmbeddingOutcome> {
  const text = buildKbEmbeddingText(args.title, args.content);
  if (!text) return { status: "skipped", reason: "empty_text" };

  const embed = args.embedFn ?? generateEmbedding;
  let vector: number[];
  try {
    vector = await embed(text);
  } catch (err) {
    console.error(
      `[kb-embedding] generateEmbedding failed for article ${args.articleId}:`,
      err instanceof Error ? err.message : err
    );
    return { status: "failed", reason: "embed_error" };
  }

  const { error } = await args.supabase
    .from("kb_articles")
    .update({ embedding: vector, updated_at: new Date().toISOString() })
    .eq("id", args.articleId);

  if (error) {
    console.error(
      `[kb-embedding] persist failed for article ${args.articleId}: ${error.message}`
    );
    return { status: "failed", reason: "persist_error" };
  }

  return { status: "ok" };
}
